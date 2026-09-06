// Capture receipts are shared by both capture routes and scoped to the authenticated user.
// Keep receipts indefinitely: expiring a receipt would allow a delayed Watch retry to
// create a second meeting. Changing parser mode or route does not change capture identity.
import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024 - 256 * 1024; // Same safety margin as meeting-store.js.
const hash = value => createHash('sha256').update(value).digest('hex');

export class CaptureIdempotencyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CaptureIdempotencyError';
    this.status = status;
    this.code = code;
  }
}

const unavailable = () => new CaptureIdempotencyError(503, 'capture_storage_unavailable', 'Capture storage is temporarily unavailable. Retry with the same capture ID.');
const conflict = () => new CaptureIdempotencyError(409, 'capture_id_conflict', 'This capture ID was already used for different transcript text.');

/** Returns null for legacy requests and dry runs. Call only after authenticating the user. */
export function captureIdentity(req, userId, transcript) {
  if (req.body?.dryRun === true) return null;
  const bodyID = req.body?.captureID;
  const headerID = req.headers?.['idempotency-key'];
  function parse(value) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !UUID.test(value.trim())) {
      throw new CaptureIdempotencyError(400, 'invalid_capture_id', 'captureID and Idempotency-Key must be UUID strings.');
    }
    return value.trim().toLowerCase();
  }
  const body = parse(bodyID), header = parse(headerID);
  if (body && header && body !== header) {
    throw new CaptureIdempotencyError(400, 'capture_id_mismatch', 'captureID and Idempotency-Key must match.');
  }
  const id = body || header;
  if (!id) return null;
  if (typeof userId !== 'string' || !userId || typeof transcript !== 'string' || !transcript.trim()) throw unavailable();
  const recordID = hash(JSON.stringify([userId, id]));
  return {
    id, userId, recordID,
    key: `capture-receipt:v1:${hash(userId)}:${id}`,
    fingerprint: hash(transcript.trim()),
    meetingID: `m_capture_${recordID}`,
  };
}

function parseResponse(value) {
  // @vercel/kv automatically deserializes JSON strings inside EVAL result arrays.
  const response = typeof value === 'string' ? JSON.parse(value) : value;
  if (!response || response.success !== true || !Array.isArray(response.tasks)) throw unavailable();
  return response;
}

/** Read errors must fail closed; never treat an unavailable receipt store as a new capture. */
export async function findCaptureResponse(kv, capture) {
  if (!capture) return null;
  try {
    const raw = await kv.get(capture.key);
    if (raw === null || raw === undefined) return null;
    const receipt = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!receipt || receipt.version !== 1 || typeof receipt.fingerprint !== 'string') throw unavailable();
    if (receipt.fingerprint !== capture.fingerprint) throw conflict();
    return parseResponse(receipt.response);
  } catch (error) {
    if (error instanceof CaptureIdempotencyError) throw error;
    throw unavailable();
  }
}

/** Timestamp-only task IDs can collide when distinct captures finish in the same millisecond. */
export function captureTaskIDs(capture, tasks) {
  if (!capture) return tasks;
  return tasks.map((task, index) => ({
    ...task,
    id: `t_capture_${capture.recordID}_${index}`,
    activity: (task.activity || []).map((event, eventIndex) => ({
      ...event, id: `act_capture_${capture.recordID}_${index}_${eventIndex}`,
    })),
  }));
}

// Redis scripts isolate concurrent captures. All parsing/size checks precede a single
// MSET, so receipt, transcript, meeting metadata and tasks commit together. In particular,
// a response lost after MSET is recoverable by replaying the persisted response.
//
// Preserve existing array JSON verbatim when prepending records. Lua cjson re-encoding
// would change nested empty arrays into objects and can round existing numeric values.
// Other routes still use read-modify-write arrays: their existing lost-update risk is
// outside this capture fix. They must migrate before whole-application concurrency is safe.
export const CAPTURE_COMMIT_SCRIPT = `
local existingReceipt = redis.call('GET', KEYS[1])
if existingReceipt then
  local ok, receipt = pcall(cjson.decode, existingReceipt)
  if not ok or type(receipt) ~= 'table' or receipt.version ~= 1 or type(receipt.fingerprint) ~= 'string' or type(receipt.response) ~= 'string' then
    return {'unavailable'}
  end
  if receipt.fingerprint ~= ARGV[1] then return {'conflict'} end
  return {'replay', receipt.response}
end

local function readArray(key)
  local raw = redis.call('GET', key) or '[]'
  local ok, array = pcall(cjson.decode, raw)
  if not ok or type(array) ~= 'table' or not string.match(raw, '^%s*%[') then return nil end
  return raw, array
end

local meetingsJSON, meetings = readArray(KEYS[2])
local tasksJSON, tasks = readArray(KEYS[3])
if not meetingsJSON or not tasksJSON then return {'unavailable'} end
local meta = cjson.decode(ARGV[2])
-- An unexpected missing receipt must not cause duplicate records to be appended.
for _, meeting in ipairs(meetings) do
  if type(meeting) == 'table' and meeting.id == meta.id then return {'unavailable'} end
end
for _, task in ipairs(tasks) do
  if type(task) == 'table' and task.meetingId == meta.id then return {'unavailable'} end
end

local function prepend(newJSON, oldJSON)
  local added = string.match(newJSON, '^%s*%[(.*)%]%s*$')
  local old = string.match(oldJSON, '^%s*%[(.*)%]%s*$')
  if string.match(added, '^%s*$') then return oldJSON end
  if string.match(old, '^%s*$') then return '[' .. added .. ']' end
  return '[' .. added .. ',' .. old .. ']'
end

local mergedMeetings = prepend('[' .. ARGV[2] .. ']', meetingsJSON)
local mergedTasks = prepend(ARGV[3], tasksJSON)
local receipt = cjson.decode(ARGV[5])
local maxBytes = tonumber(ARGV[6])
if #mergedMeetings > maxBytes or #mergedTasks > maxBytes or #ARGV[4] > maxBytes or #ARGV[5] > maxBytes then
  return {'storage_limit'}
end
redis.call('MSET', KEYS[2], mergedMeetings, KEYS[3], mergedTasks, KEYS[4], ARGV[4], KEYS[1], ARGV[5])
return {'stored', receipt.response}
`;

/** Only the winner's records and response are persisted; concurrent retries replay it. */
export async function commitCapture(kv, capture, { meeting, tasks, response }) {
  if (!capture || meeting.id !== capture.meetingID || meeting.userId !== capture.userId ||
      typeof meeting.transcript !== 'string' || hash(meeting.transcript.trim()) !== capture.fingerprint ||
      !Array.isArray(tasks) || tasks.some(task => task.userId !== capture.userId || task.meetingId !== meeting.id)) {
    throw unavailable();
  }
  // The same storage shape as meeting-store.js: metadata array plus an independent transcript key.
  const { transcript, ...metadata } = meeting;
  const meta = { ...metadata, hasTranscript: transcript.length > 0, transcriptLength: transcript.length };
  const responseJSON = JSON.stringify(response);
  const receipt = JSON.stringify({ version: 1, fingerprint: capture.fingerprint, response: responseJSON });
  const args = [capture.fingerprint, JSON.stringify(meta), JSON.stringify(tasks), JSON.stringify({ text: transcript }), receipt, MAX_BYTES];
  if (args.reduce((sum, arg) => sum + Buffer.byteLength(String(arg), 'utf8'), 0) > MAX_BYTES) {
    throw new CaptureIdempotencyError(413, 'capture_too_large', 'The capture is too large to store.');
  }
  try {
    const result = await kv.eval(CAPTURE_COMMIT_SCRIPT,
      [capture.key, 'meetings', 'tasks', `meeting:${meeting.id}:transcript`], args);
    if (!Array.isArray(result)) throw unavailable();
    if (result[0] === 'conflict') throw conflict();
    if (result[0] === 'storage_limit') {
      throw new CaptureIdempotencyError(503, 'capture_storage_full', 'Capture storage is full. Retry after space is available.');
    }
    if (result[0] !== 'stored' && result[0] !== 'replay') throw unavailable();
    return parseResponse(result[1]);
  } catch (error) {
    if (error instanceof CaptureIdempotencyError) throw error;
    throw unavailable();
  }
}

/** Returns true when an expected idempotency/storage error has been sent. */
export function sendCaptureError(error, res) {
  if (!(error instanceof CaptureIdempotencyError)) return false;
  if (error.status === 503) res.setHeader('Retry-After', '3');
  res.status(error.status).json({ error: error.message, code: error.code });
  return true;
}

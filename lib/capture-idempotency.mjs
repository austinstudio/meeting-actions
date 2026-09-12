// Capture receipts are shared by both capture routes and scoped to the authenticated user.
// Receipts expire after RECEIPT_TTL_SECONDS (90 days). The phone retries a capture for at most
// ~18 minutes per recovery window and gives up long before that, so the receipt is only needed
// for days, not forever; the commit script's task-id-prefix check is the backstop against a
// duplicate append even without a receipt. Changing parser mode or route does not change
// capture identity.
import { createHash } from 'node:crypto';
import { TASKS_VERSION_KEY } from './task-store.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 10 * 1024 * 1024 - 256 * 1024; // Same safety margin as meeting-store.js.
/** How long a capture receipt is kept before Redis drops it (ARGV[8] of the commit script). */
export const RECEIPT_TTL_SECONDS = 90 * 24 * 60 * 60;
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
  const day = captureDay(req.body);
  return {
    id, userId, recordID, day,
    key: `capture-receipt:v1:${hash(userId)}:${id}`,
    fingerprint: hash(transcript.trim()),
    // One meeting per user per local day collects every capture from the watch/phone app.
    meetingID: `m_capture_day_${hash(userId).slice(0, 16)}_${day}`,
  };
}

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The capture's calendar day in the recording zone (sent by the phone); UTC today for legacy clients. */
export function captureDay(body) {
  const localDate = body?.localDate;
  if (typeof localDate === 'string' && LOCAL_DATE.test(localDate)) return localDate;
  return new Date().toISOString().slice(0, 10);
}

/** "Quick captures — Sep 7, 2026": the date is the only thing that tells one day's meeting from the next. */
export function dailyMeetingTitle(day) {
  const [year, month, date] = day.split('-').map(Number);
  return `Quick captures — ${MONTHS[month - 1]} ${date}, ${year}`;
}

/** One line of the day's transcript log: "[9:41 AM] <transcript>", clock time in the recording zone. */
export function captureEntryText(transcript, recordedAt, timeZone) {
  const at = Number.isFinite(recordedAt) ? new Date(recordedAt) : new Date();
  let time;
  try {
    time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timeZone || 'UTC' }).format(at);
  } catch {
    time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(at);
  }
  return `[${time}] ${transcript}`;
}

/** Shared shape of the day's meeting record (transcript stays the raw capture text for the fingerprint check). */
export function dailyMeeting(capture, { userId, transcript, captureSource, parsedBy }) {
  const title = dailyMeetingTitle(capture.day);
  return {
    id: capture.meetingID,
    userId,
    title,
    sourceFileName: 'Quick Notes',
    transcript,
    date: capture.day,
    duration: null,
    participants: [],
    summary: `Voice memos captured with Quick Notes on ${title.replace('Quick captures — ', '')}.`,
    source: 'quick-capture',
    captureSource,
    ...(parsedBy ? { parsedBy } : {}),
    processedAt: new Date().toISOString(),
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
// KEYS[5] is the tasks version counter that `lib/task-store.mjs` compare-and-set writers check;
// bumping it here makes an in-flight Board edit retry instead of overwriting this capture.
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
-- The day's meeting may already exist (earlier captures today): then only tasks and the
-- transcript log are appended, and the meeting metadata is left untouched.
local meetingExists = false
for _, meeting in ipairs(meetings) do
  if type(meeting) == 'table' and meeting.id == meta.id then meetingExists = true end
end
-- An unexpected missing receipt must not cause this capture's tasks to be appended twice.
local taskPrefix = ARGV[7]
for _, task in ipairs(tasks) do
  if type(task) == 'table' and type(task.id) == 'string' and string.sub(task.id, 1, #taskPrefix) == taskPrefix then
    return {'unavailable'}
  end
end

-- Lua patterns with '(.*)' recurse per character and Redis rejects them on inputs this size
-- ("pattern/input too complex" at ~1 MB). Locate the brackets by scanning instead.
local function arrayBody(json)
  local first = string.find(json, '[', 1, true)
  if not first or not string.match(string.sub(json, 1, first - 1), '^%s*$') then return nil end
  local last = #json
  while last > first do
    local c = string.sub(json, last, last)
    if c == ']' then break end
    if not string.match(c, '^%s$') then return nil end
    last = last - 1
  end
  if last <= first then return nil end
  return string.sub(json, first + 1, last - 1)
end

local function prepend(newJSON, oldJSON)
  local added = arrayBody(newJSON)
  local old = arrayBody(oldJSON)
  if not added or not old then return nil end
  if string.match(added, '^%s*$') then return oldJSON end
  if string.match(old, '^%s*$') then return '[' .. added .. ']' end
  return '[' .. added .. ',' .. old .. ']'
end

local mergedMeetings = meetingsJSON
if not meetingExists then mergedMeetings = prepend('[' .. ARGV[2] .. ']', meetingsJSON) end
local mergedTasks = prepend(ARGV[3], tasksJSON)
if not mergedMeetings or not mergedTasks then return {'unavailable'} end
-- Transcript log for the day: append this capture's entry to what earlier captures wrote.
local transcriptJSON = ARGV[4]
if meetingExists then
  local existing = redis.call('GET', KEYS[4])
  if existing then
    local okPrev, prev = pcall(cjson.decode, existing)
    local okNext, nextEntry = pcall(cjson.decode, ARGV[4])
    if not okPrev or not okNext or type(prev) ~= 'table' or type(nextEntry) ~= 'table' or type(nextEntry.text) ~= 'string' then
      return {'unavailable'}
    end
    local prevText = type(prev.text) == 'string' and prev.text or ''
    transcriptJSON = cjson.encode({ text = prevText .. '\\n\\n' .. nextEntry.text })
  end
end
local receipt = cjson.decode(ARGV[5])
local maxBytes = tonumber(ARGV[6])
if #mergedMeetings > maxBytes or #mergedTasks > maxBytes or #transcriptJSON > maxBytes or #ARGV[5] > maxBytes then
  return {'storage_limit'}
end
redis.call('MSET', KEYS[2], mergedMeetings, KEYS[3], mergedTasks, KEYS[4], transcriptJSON, KEYS[1], ARGV[5])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[8]))
redis.call('INCR', KEYS[5])
return {'stored', receipt.response}
`;

/** Only the winner's records and response are persisted; concurrent retries replay it.
 *  `transcriptEntry` is the line appended to the day's transcript log (defaults to the raw transcript). */
export async function commitCapture(kv, capture, { meeting, tasks, response, transcriptEntry }) {
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
  const entry = typeof transcriptEntry === 'string' && transcriptEntry.trim() ? transcriptEntry : transcript;
  const args = [capture.fingerprint, JSON.stringify(meta), JSON.stringify(tasks), JSON.stringify({ text: entry }), receipt, MAX_BYTES,
    `t_capture_${capture.recordID}_`, RECEIPT_TTL_SECONDS];
  if (args.reduce((sum, arg) => sum + Buffer.byteLength(String(arg), 'utf8'), 0) > MAX_BYTES) {
    throw new CaptureIdempotencyError(413, 'capture_too_large', 'The capture is too large to store.');
  }
  try {
    const result = await kv.eval(CAPTURE_COMMIT_SCRIPT,
      [capture.key, 'meetings', 'tasks', `meeting:${meeting.id}:transcript`, TASKS_VERSION_KEY], args);
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

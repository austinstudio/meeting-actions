// lib/pebble-memos.mjs
// Pebble Index memos held for the Quick Notes phone app ("path 2"): the Pebble app posts audio + its own
// transcription; the server only stores them and the phone pulls, parses on-device, posts a structured
// capture, then acknowledges. Storage is Vercel KV (no Blob store configured): audio as base64 under its
// own key with a TTL, memo metadata under another, and a small per-user pending list.
//
// Keys:  pebble:memo:<userId>:<memoId>     memo record (TTL 14 d)
//        pebble:audio:<userId>:<memoId>    base64 audio (TTL 14 d, deleted on ack)
//        pebble:pendingz:<userId>          sorted set of memoIds, score = receivedAt epoch ms (oldest first)
//        pebble:pending:<userId>           legacy JSON array; migrated into the sorted set on first read, then deleted
//
// Queue membership is one atomic command per step (ZADD / ZREM), so two memos arriving together cannot
// overwrite each other's membership and a crash between the record write and the queue write is repaired
// by the duplicate path on the Pebble app's retry. Every loop here is bounded by MAX_PENDING.

export const MEMO_TTL_SECONDS = 14 * 24 * 3600;
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;   // ~25 min of AAC; the KV request limit is 10 MB
export const MAX_TRANSCRIPTION_CHARS = 20_000;

export const memoKey = (userId, id) => `pebble:memo:${userId}:${id}`;
export const audioKey = (userId, id) => `pebble:audio:${userId}:${id}`;
/** Legacy array key, kept only so the one-time migration can find it. */
export const pendingKey = (userId) => `pebble:pending:${userId}`;
export const pendingSetKey = (userId) => `pebble:pendingz:${userId}`;
/** Hard cap on queue membership and on every loop below; matches the old array's slice(-200). */
export const MAX_PENDING = 200;

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z0-9]+)?$/i;
const SAFE_ID = /^[a-z0-9-]{8,80}$/i;

/** The per-memo UUID the Pebble app puts at the end of the audio filename (`ring_<device>-<n>-<uuid>.m4a`). */
export function memoIdFromFilename(filename) {
  const m = UUID_RE.exec(filename || '');
  return m ? m[1].toLowerCase() : null;
}

export function isSafeMemoId(id) { return typeof id === 'string' && SAFE_ID.test(id); }

/**
 * Multipart parts (from parseMultipart) + headers → memo, or a skip reason.
 * Test events (`test=true` / x-index-trigger: test-event) are skipped; so are deliveries with neither
 * audio nor transcription.
 */
export function buildMemo({ parts, headers = {}, receivedAt = new Date().toISOString() }) {
  const text = (name) => parts.find(p => p.name === name && !p.filename)?.body?.toString('utf8') ?? null;
  const trigger = String(headers['x-index-trigger'] || '');
  if (text('test') === 'true' || trigger === 'test-event') return { skip: 'test-event' };

  const audio = parts.find(p => p.name === 'audio' && p.filename) || parts.find(p => p.filename && /^audio\//i.test(p.contentType || ''));
  const transcription = (text('transcription') || '').trim().slice(0, MAX_TRANSCRIPTION_CHARS);
  if (!audio && !transcription) return { skip: 'no audio or transcription' };
  if (audio && audio.body.length > MAX_AUDIO_BYTES) return { skip: `audio too large (${audio.body.length} bytes)` };

  const recordedAtMs = Number(text('recordedAt'));
  const recordedAt = Number.isFinite(recordedAtMs) && recordedAtMs > 0 ? recordedAtMs : Date.parse(receivedAt);
  const id = memoIdFromFilename(audio?.filename) || `ring-${recordedAt}`;

  return {
    memo: {
      id,
      transcription,
      recordedAt,                          // epoch ms
      client: text('client') || 'ring',
      trigger: trigger || null,
      audio: audio ? { filename: audio.filename, contentType: audio.contentType || 'audio/mp4', bytes: audio.body.length } : null,
      receivedAt,
      status: 'pending',
    },
    audioBody: audio ? audio.body : null,
  };
}

/** What the phone gets from GET /api/pebble/pending. */
export function serializeMemo(memo) {
  return {
    id: memo.id,
    transcription: memo.transcription,
    recordedAt: memo.recordedAt,
    client: memo.client,
    trigger: memo.trigger,
    receivedAt: memo.receivedAt,
    audio: memo.audio ? { ...memo.audio, path: `/api/pebble/audio/${memo.id}` } : null,
  };
}

const scoreFor = (memo) => {
  const ms = Date.parse(memo?.receivedAt);
  return Number.isFinite(ms) ? ms : Date.now();
};

/** One atomic ZADD, then keep the set within MAX_PENDING by dropping the oldest ranks (as the array's slice did). */
async function enqueue(kv, userId, memo) {
  await kv.zadd(pendingSetKey(userId), { score: scoreFor(memo), member: memo.id });
  const size = await kv.zcard(pendingSetKey(userId));
  if (size > MAX_PENDING) await kv.zremrangebyrank(pendingSetKey(userId), 0, size - MAX_PENDING - 1);
}

/**
 * One-time move of a user's legacy pending array into the sorted set. Idempotent: re-adding a member is a
 * no-op, and the array is deleted only after every live id has been added. Bounded to MAX_PENDING reads.
 */
async function migrateLegacyPending(kv, userId) {
  const legacy = await kv.get(pendingKey(userId));
  if (!Array.isArray(legacy)) return;
  for (const id of legacy.slice(-MAX_PENDING)) {
    const memo = await kv.get(memoKey(userId, id));
    if (memo && memo.status === 'pending') await kv.zadd(pendingSetKey(userId), { score: scoreFor(memo), member: id });
  }
  await kv.del(pendingKey(userId));
}

/**
 * Store a new memo: audio (if any), record, then queue membership. Returns false when the id already exists.
 * A duplicate whose record is still pending is re-queued: that is exactly the state a crash between the record
 * write and the ZADD leaves behind, and the Pebble app's retry is what repairs it.
 */
export async function storeMemo(kv, userId, memo, audioBody) {
  const existing = await kv.get(memoKey(userId, memo.id));
  if (existing) {
    if (existing.status === 'pending') await enqueue(kv, userId, existing);
    return false;
  }
  if (audioBody) await kv.set(audioKey(userId, memo.id), audioBody.toString('base64'), { ex: MEMO_TTL_SECONDS });
  await kv.set(memoKey(userId, memo.id), memo, { ex: MEMO_TTL_SECONDS });
  await enqueue(kv, userId, memo);
  return true;
}

/** Pending memos, oldest first; ids whose record expired or is no longer pending are removed from the set. */
export async function listPending(kv, userId) {
  await migrateLegacyPending(kv, userId);
  const ids = (await kv.zrange(pendingSetKey(userId), 0, MAX_PENDING - 1)) || [];
  const memos = [];
  for (const raw of ids) {
    const id = String(raw);
    const memo = await kv.get(memoKey(userId, id));
    if (memo && memo.status === 'pending') memos.push(memo);
    else await kv.zrem(pendingSetKey(userId), id);
  }
  return memos;
}

/**
 * The phone has the memo (or chose to skip it): mark done, free the audio, drop from the queue. Idempotent.
 * The record is marked done before the ZREM, so a crash in between leaves a done memo in the set that the
 * next listPending prunes — never a pending memo outside it.
 */
export async function ackMemo(kv, userId, id, { captureId = null, outcome = 'ingested' } = {}) {
  const memo = await kv.get(memoKey(userId, id));
  if (memo) {
    await kv.set(memoKey(userId, id), { ...memo, status: 'done', outcome, captureId, doneAt: new Date().toISOString() }, { ex: MEMO_TTL_SECONDS });
  }
  await kv.del(audioKey(userId, id));
  await kv.zrem(pendingSetKey(userId), id);
  return Boolean(memo);
}

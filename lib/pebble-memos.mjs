// lib/pebble-memos.mjs
// Pebble Index memos held for the Quick Notes phone app ("path 2"): the Pebble app posts audio + its own
// transcription; the server only stores them and the phone pulls, parses on-device, posts a structured
// capture, then acknowledges. Storage is Vercel KV (no Blob store configured): audio as base64 under its
// own key with a TTL, memo metadata under another, and a small per-user pending list.
//
// Keys:  pebble:memo:<userId>:<memoId>     memo record (TTL 14 d)
//        pebble:audio:<userId>:<memoId>    base64 audio (TTL 14 d, deleted on ack)
//        pebble:pending:<userId>           [memoId, …] oldest first

export const MEMO_TTL_SECONDS = 14 * 24 * 3600;
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;   // ~25 min of AAC; the KV request limit is 10 MB
export const MAX_TRANSCRIPTION_CHARS = 20_000;

export const memoKey = (userId, id) => `pebble:memo:${userId}:${id}`;
export const audioKey = (userId, id) => `pebble:audio:${userId}:${id}`;
export const pendingKey = (userId) => `pebble:pending:${userId}`;

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

/** Store a new memo: audio (if any), record, pending list. Returns false when the id already exists. */
export async function storeMemo(kv, userId, memo, audioBody) {
  if (await kv.get(memoKey(userId, memo.id))) return false;
  if (audioBody) await kv.set(audioKey(userId, memo.id), audioBody.toString('base64'), { ex: MEMO_TTL_SECONDS });
  await kv.set(memoKey(userId, memo.id), memo, { ex: MEMO_TTL_SECONDS });
  const pending = (await kv.get(pendingKey(userId))) || [];
  if (!pending.includes(memo.id)) await kv.set(pendingKey(userId), [...pending, memo.id].slice(-200));
  return true;
}

/** Pending memos, oldest first; ids whose record expired are pruned from the list. */
export async function listPending(kv, userId) {
  const ids = (await kv.get(pendingKey(userId))) || [];
  const memos = [];
  const live = [];
  for (const id of ids) {
    const memo = await kv.get(memoKey(userId, id));
    if (memo && memo.status === 'pending') { memos.push(memo); live.push(id); }
  }
  if (live.length !== ids.length) await kv.set(pendingKey(userId), live);
  return memos;
}

/** The phone has the memo (or chose to skip it): mark done, drop from pending, free the audio. Idempotent. */
export async function ackMemo(kv, userId, id, { captureId = null, outcome = 'ingested' } = {}) {
  const memo = await kv.get(memoKey(userId, id));
  if (memo) {
    await kv.set(memoKey(userId, id), { ...memo, status: 'done', outcome, captureId, doneAt: new Date().toISOString() }, { ex: MEMO_TTL_SECONDS });
  }
  await kv.del(audioKey(userId, id));
  const pending = (await kv.get(pendingKey(userId))) || [];
  if (pending.includes(id)) await kv.set(pendingKey(userId), pending.filter(x => x !== id));
  return Boolean(memo);
}

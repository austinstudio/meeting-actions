import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMultipart } from '../lib/pebble-webhook.mjs';
import { buildMemo, memoIdFromFilename, storeMemo, listPending, ackMemo, serializeMemo, memoKey, audioKey, pendingKey, pendingSetKey, MAX_AUDIO_BYTES, MAX_PENDING } from '../lib/pebble-memos.mjs';

/** Strings + sorted sets, mirroring the @upstash/redis calls pebble-memos makes (zrange is index-based, oldest first). */
class FakeKV {
  values = new Map(); ttl = new Map(); zsets = new Map(); log = [];
  /** Set `failNext.zadd = true` (etc.) to make the next call of that command throw once. */
  failNext = {};
  #maybeFail(cmd) { this.log.push(cmd); if (this.failNext[cmd]) { this.failNext[cmd] = false; throw new Error(`injected ${cmd} failure`); } }
  async get(k) { this.#maybeFail('get'); return this.values.has(k) ? JSON.parse(this.values.get(k)) : null; }
  async set(k, v, opts) { this.#maybeFail('set'); this.values.set(k, JSON.stringify(v)); if (opts?.ex) this.ttl.set(k, opts.ex); }
  async del(k) { this.#maybeFail('del'); this.values.delete(k); this.ttl.delete(k); this.zsets.delete(k); }
  #z(k) { if (!this.zsets.has(k)) this.zsets.set(k, new Map()); return this.zsets.get(k); }
  #sorted(k) { return [...(this.zsets.get(k) || new Map())].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([m]) => m); }
  async zadd(k, ...pairs) { this.#maybeFail('zadd'); const z = this.#z(k); let added = 0; for (const { score, member } of pairs) { if (!z.has(member)) added++; z.set(member, score); } return added; }
  async zrange(k, start, stop) { this.#maybeFail('zrange'); const all = this.#sorted(k); return all.slice(start, stop === -1 ? undefined : stop + 1); }
  async zrem(k, ...members) { this.#maybeFail('zrem'); const z = this.#z(k); let n = 0; for (const m of members) if (z.delete(m)) n++; return n; }
  async zcard(k) { this.#maybeFail('zcard'); return this.zsets.get(k)?.size ?? 0; }
  async zremrangebyrank(k, start, stop) { this.#maybeFail('zremrangebyrank'); const doomed = this.#sorted(k).slice(start, stop + 1); const z = this.#z(k); doomed.forEach(m => z.delete(m)); return doomed.length; }
  pendingIds(userId) { return this.#sorted(pendingSetKey(userId)); }
}

const b = 'dac79c1d-7a4a-4861-9373-d663d631fc26';
function memoBody({ test = false, audio = true, transcription = 'Check with Lauren about the deck.', recordedAt = '1789004265865' } = {}) {
  const chunks = [];
  if (audio) {
    const m4a = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypM4A '), Buffer.alloc(3000, 7)]);
    chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="audio"; filename="ring_5F2FD2B5-ACDE-92B0-42DB-A32F0F8ACCD0-33-9978fd1f-d90c-4c2c-b492-7b9469b13477.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`), m4a, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="transcription"\r\n\r\n${transcription}\r\n`));
  if (test) chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="test"\r\n\r\ntrue\r\n`));
  chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="recordedAt"\r\n\r\n${recordedAt}\r\n`));
  chunks.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="client"\r\n\r\nring\r\n`));
  chunks.push(Buffer.from(`--${b}--\r\n`));
  return Buffer.concat(chunks);
}
const CT = `multipart/form-data; boundary=${b}`;

test('parseMultipart returns raw part bodies, filenames and types', () => {
  const parts = parseMultipart(memoBody(), CT);
  assert.deepEqual(parts.map(p => p.name), ['audio', 'transcription', 'recordedAt', 'client']);
  assert.equal(parts[0].filename.endsWith('.m4a'), true);
  assert.equal(parts[0].contentType, 'audio/mp4');
  assert.equal(parts[0].body.length, 3012);
  assert.equal(parts[1].body.toString(), 'Check with Lauren about the deck.');
  assert.equal(parseMultipart(Buffer.from('x'), 'multipart/form-data'), null);
});

test('memo id is the uuid at the end of the Pebble filename', () => {
  assert.equal(memoIdFromFilename('ring_5F2FD2B5-ACDE-92B0-42DB-A32F0F8ACCD0-33-9978FD1F-D90C-4C2C-B492-7B9469B13477.m4a'), '9978fd1f-d90c-4c2c-b492-7b9469b13477');
  assert.equal(memoIdFromFilename('memo.m4a'), null);
  assert.equal(memoIdFromFilename(null), null);
});

test('buildMemo: real memo → record + audio; test event and empty deliveries are skipped', () => {
  const real = buildMemo({ parts: parseMultipart(memoBody(), CT), headers: { 'x-index-trigger': 'single-click-hold' }, receivedAt: '2026-09-10T01:37:57.196Z' });
  assert.equal(real.skip, undefined);
  assert.equal(real.memo.id, '9978fd1f-d90c-4c2c-b492-7b9469b13477');
  assert.equal(real.memo.transcription, 'Check with Lauren about the deck.');
  assert.equal(real.memo.recordedAt, 1789004265865);
  assert.equal(real.memo.trigger, 'single-click-hold');
  assert.deepEqual(real.memo.audio, { filename: 'ring_5F2FD2B5-ACDE-92B0-42DB-A32F0F8ACCD0-33-9978fd1f-d90c-4c2c-b492-7b9469b13477.m4a', contentType: 'audio/mp4', bytes: 3012 });
  assert.equal(real.audioBody.length, 3012);
  assert.equal(real.memo.status, 'pending');

  assert.equal(buildMemo({ parts: parseMultipart(memoBody({ test: true, audio: false, transcription: 'Index webhook test event' }), CT), headers: { 'x-index-trigger': 'test-event' } }).skip, 'test-event');
  assert.equal(buildMemo({ parts: parseMultipart(memoBody({ audio: false, transcription: '' }), CT) }).skip, 'no audio or transcription');
  const textOnly = buildMemo({ parts: parseMultipart(memoBody({ audio: false }), CT) });
  assert.equal(textOnly.memo.id, 'ring-1789004265865', 'no audio filename → id from recordedAt');
  assert.equal(textOnly.memo.audio, null);
  const big = { parts: [{ name: 'audio', filename: 'x-9978fd1f-d90c-4c2c-b492-7b9469b13477.m4a', contentType: 'audio/mp4', body: Buffer.alloc(MAX_AUDIO_BYTES + 1) }] };
  assert.match(buildMemo(big).skip, /audio too large/);
});

test('store → pending → ack lifecycle, idempotent and per user', async () => {
  const kv = new FakeKV();
  const { memo, audioBody } = buildMemo({ parts: parseMultipart(memoBody(), CT), receivedAt: '2026-09-10T01:37:57.196Z' });
  assert.equal(await storeMemo(kv, 'u1', memo, audioBody), true);
  assert.equal(await storeMemo(kv, 'u1', memo, audioBody), false, 'same memo again is a duplicate');
  assert.equal(kv.ttl.get(audioKey('u1', memo.id)), 14 * 86400);
  assert.equal(kv.ttl.get(memoKey('u1', memo.id)), 14 * 86400);
  assert.deepEqual(kv.pendingIds('u1'), [memo.id]);
  assert.equal(Buffer.from(await kv.get(audioKey('u1', memo.id)), 'base64').length, 3012);

  const pending = await listPending(kv, 'u1');
  assert.equal(pending.length, 1);
  const wire = serializeMemo(pending[0]);
  assert.equal(wire.audio.path, `/api/pebble/audio/${memo.id}`);
  assert.equal(wire.transcription, memo.transcription);
  assert.equal(wire.recordedAt, 1789004265865);
  assert.equal(await listPending(kv, 'u2').then(m => m.length), 0, 'other users see nothing');

  assert.equal(await ackMemo(kv, 'u1', memo.id, { captureId: 'cap-1' }), true);
  assert.equal(await kv.get(audioKey('u1', memo.id)), null, 'audio freed on ack');
  assert.deepEqual(kv.pendingIds('u1'), []);
  assert.equal((await kv.get(memoKey('u1', memo.id))).status, 'done');
  assert.equal((await kv.get(memoKey('u1', memo.id))).captureId, 'cap-1');
  assert.equal(await ackMemo(kv, 'u1', memo.id), true, 'ack again is harmless');
  assert.equal(await ackMemo(kv, 'u1', 'unknown-id-000000'), false);
  assert.equal((await listPending(kv, 'u1')).length, 0);
});

const pendingMemo = (id, receivedAt) => ({ id, status: 'pending', transcription: 'x', recordedAt: 1, audio: null, receivedAt });

test('listPending prunes ids whose memo expired or is no longer pending', async () => {
  const kv = new FakeKV();
  await kv.zadd(pendingSetKey('u1'), { score: 1, member: 'gone-1234567' }, { score: 2, member: 'alive-123456' }, { score: 3, member: 'done-1234567' });
  await kv.set(memoKey('u1', 'alive-123456'), pendingMemo('alive-123456'));
  await kv.set(memoKey('u1', 'done-1234567'), { ...pendingMemo('done-1234567'), status: 'done' });
  const pending = await listPending(kv, 'u1');
  assert.deepEqual(pending.map(m => m.id), ['alive-123456']);
  assert.deepEqual(kv.pendingIds('u1'), ['alive-123456']);
});

test('two memos arriving together both end up pending, oldest first', async () => {
  const kv = new FakeKV();
  const a = pendingMemo('aaaaaaaa-1', '2026-09-15T10:00:01.000Z');
  const b = pendingMemo('bbbbbbbb-2', '2026-09-15T10:00:00.000Z');
  const results = await Promise.all([storeMemo(kv, 'u1', a, null), storeMemo(kv, 'u1', b, null)]);
  assert.deepEqual(results, [true, true]);
  assert.deepEqual(kv.pendingIds('u1'), ['bbbbbbbb-2', 'aaaaaaaa-1'], 'ordered by receivedAt, not arrival');
  assert.deepEqual((await listPending(kv, 'u1')).map(m => m.id), ['bbbbbbbb-2', 'aaaaaaaa-1']);
});

test('a stored memo missing from the queue is repaired by the duplicate path', async () => {
  const kv = new FakeKV();
  const memo = pendingMemo('cccccccc-3', '2026-09-15T10:00:00.000Z');
  await kv.set(memoKey('u1', memo.id), memo);                    // record exists, queue membership lost
  assert.deepEqual(await listPending(kv, 'u1'), [], 'invisible before the retry');
  assert.equal(await storeMemo(kv, 'u1', memo, null), false, 'still reported as a duplicate');
  assert.deepEqual((await listPending(kv, 'u1')).map(m => m.id), [memo.id], 'but now discoverable');
  await ackMemo(kv, 'u1', memo.id);
  assert.equal(await storeMemo(kv, 'u1', memo, null), false);
  assert.deepEqual(await listPending(kv, 'u1'), [], 'a done duplicate is not re-queued');
});

test('a failure after the record write is repaired when the Pebble app retries', async () => {
  const kv = new FakeKV();
  const memo = pendingMemo('dddddddd-4', '2026-09-15T10:00:00.000Z');
  kv.failNext.zadd = true;
  await assert.rejects(storeMemo(kv, 'u1', memo, Buffer.from('audio')), /injected zadd failure/);
  assert.ok(await kv.get(memoKey('u1', memo.id)), 'record was written before the queue step failed');
  assert.deepEqual(await listPending(kv, 'u1'), []);
  assert.equal(await storeMemo(kv, 'u1', memo, Buffer.from('audio')), false);
  assert.deepEqual((await listPending(kv, 'u1')).map(m => m.id), [memo.id]);
  assert.ok(await kv.get(audioKey('u1', memo.id)), 'audio from the first attempt is still there');
});

test('ack removes exactly that id and leaves the rest of the queue alone', async () => {
  const kv = new FakeKV();
  for (const [i, id] of ['eeeeeeee-1', 'eeeeeeee-2', 'eeeeeeee-3'].entries()) {
    await storeMemo(kv, 'u1', pendingMemo(id, `2026-09-15T10:00:0${i}.000Z`), null);
  }
  assert.equal(await ackMemo(kv, 'u1', 'eeeeeeee-2'), true);
  assert.deepEqual(kv.pendingIds('u1'), ['eeeeeeee-1', 'eeeeeeee-3']);
  assert.deepEqual((await listPending(kv, 'u1')).map(m => m.id), ['eeeeeeee-1', 'eeeeeeee-3']);
  assert.equal(await ackMemo(kv, 'u1', 'eeeeeeee-2'), true, 'ack again is harmless');
  assert.deepEqual(kv.pendingIds('u1'), ['eeeeeeee-1', 'eeeeeeee-3']);
});

test('the legacy pending array is migrated into the sorted set once, then deleted', async () => {
  const kv = new FakeKV();
  await kv.set(pendingKey('u1'), ['gone-1234567', 'old-1234567', 'older-123456']);
  await kv.set(memoKey('u1', 'old-1234567'), pendingMemo('old-1234567', '2026-09-14T09:00:00.000Z'));
  await kv.set(memoKey('u1', 'older-123456'), pendingMemo('older-123456', '2026-09-13T09:00:00.000Z'));
  await storeMemo(kv, 'u1', pendingMemo('new-12345678', '2026-09-15T09:00:00.000Z'), null);   // arrives before any pull
  const pending = await listPending(kv, 'u1');
  assert.deepEqual(pending.map(m => m.id), ['older-123456', 'old-1234567', 'new-12345678'], 'legacy ids keep their place by receivedAt');
  assert.equal(await kv.get(pendingKey('u1')), null, 'legacy key deleted');
  const before = kv.log.length;
  await listPending(kv, 'u1');
  assert.equal(kv.log.slice(before).filter(c => c === 'zadd').length, 0, 'second read does no migration work');
});

test('the queue never grows past MAX_PENDING; the oldest ids are dropped', async () => {
  const kv = new FakeKV();
  for (let i = 0; i < MAX_PENDING + 3; i++) {
    await storeMemo(kv, 'u1', pendingMemo(`overflow-${String(i).padStart(4, '0')}`, new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString()), null);
  }
  const ids = kv.pendingIds('u1');
  assert.equal(ids.length, MAX_PENDING);
  assert.equal(ids[0], 'overflow-0003');
  assert.equal(ids.at(-1), `overflow-${String(MAX_PENDING + 2).padStart(4, '0')}`);
});

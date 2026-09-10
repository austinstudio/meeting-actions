import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMultipart } from '../lib/pebble-webhook.mjs';
import { buildMemo, memoIdFromFilename, storeMemo, listPending, ackMemo, serializeMemo, memoKey, audioKey, pendingKey, MAX_AUDIO_BYTES } from '../lib/pebble-memos.mjs';

class FakeKV {
  values = new Map(); ttl = new Map();
  async get(k) { return this.values.has(k) ? JSON.parse(this.values.get(k)) : null; }
  async set(k, v, opts) { this.values.set(k, JSON.stringify(v)); if (opts?.ex) this.ttl.set(k, opts.ex); }
  async del(k) { this.values.delete(k); this.ttl.delete(k); }
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
  assert.deepEqual(await kv.get(pendingKey('u1')), [memo.id]);
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
  assert.deepEqual(await kv.get(pendingKey('u1')), []);
  assert.equal((await kv.get(memoKey('u1', memo.id))).status, 'done');
  assert.equal((await kv.get(memoKey('u1', memo.id))).captureId, 'cap-1');
  assert.equal(await ackMemo(kv, 'u1', memo.id), true, 'ack again is harmless');
  assert.equal(await ackMemo(kv, 'u1', 'unknown-id-000000'), false);
  assert.equal((await listPending(kv, 'u1')).length, 0);
});

test('listPending prunes ids whose memo expired', async () => {
  const kv = new FakeKV();
  await kv.set(pendingKey('u1'), ['gone-1234567', 'alive-123456']);
  await kv.set(memoKey('u1', 'alive-123456'), { id: 'alive-123456', status: 'pending', transcription: 'x', recordedAt: 1, audio: null });
  const pending = await listPending(kv, 'u1');
  assert.deepEqual(pending.map(m => m.id), ['alive-123456']);
  assert.deepEqual(await kv.get(pendingKey('u1')), ['alive-123456']);
});

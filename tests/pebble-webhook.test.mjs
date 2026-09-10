import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDelivery, redactValue, sniffMagic, summarizeMultipart, appendRun, pickHeaders } from '../lib/pebble-webhook.mjs';

test('headers keep content/user-agent/x-* and drop anything auth-like', () => {
  const h = pickHeaders({ 'content-type': 'application/json', 'user-agent': 'Pebble/1.0', 'x-pebble-event': 'memo', authorization: 'Bearer abc', cookie: 'a=b', 'x-signature': 'zz', host: 'x' });
  assert.deepEqual(h, { 'content-type': 'application/json', 'user-agent': 'Pebble/1.0', 'x-pebble-event': 'memo' });
});

test('json delivery: keys listed, base64 audio redacted with magic, transcription text kept', () => {
  const wav = Buffer.concat([Buffer.from('RIFF....WAVEfmt '), Buffer.alloc(5000, 1)]).toString('base64');
  const body = Buffer.from(JSON.stringify({ id: 'memo_1', transcription: 'Remind me to '.repeat(40), audio: wav, duration_ms: 8000, nested: { format: 'wav' } }));
  const s = summarizeDelivery({ method: 'POST', url: '/api/pebble-webhook?x=1', headers: { 'content-type': 'application/json' }, body });
  assert.equal(s.kind, 'json');
  assert.deepEqual(s.keys, ['id', 'transcription', 'audio', 'duration_ms', 'nested']);
  assert.equal(s.json.transcription, 'Remind me to '.repeat(40));
  assert.match(s.json.audio, /^<string len=\d+ base64 looks=wav head="/);
  assert.equal(s.json.duration_ms, 8000);
  assert.equal(s.query, 'x=1');
  assert.ok(!JSON.stringify(s).includes(wav.slice(100, 200)), 'no audio bytes stored');
});

test('multipart delivery: parts with names, sizes and audio magic; small text parts kept', () => {
  const b = 'XyZ';
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(300, 2)]);
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="transcription"\r\n\r\nBuy milk\r\n`),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="recording"; filename="memo.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`), ogg, Buffer.from('\r\n'),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="meta"\r\nContent-Type: application/json\r\n\r\n{"id":"m1","ms":8000}\r\n`),
    Buffer.from(`--${b}--\r\n`),
  ]);
  const s = summarizeDelivery({ method: 'POST', url: '/api/pebble-webhook', headers: { 'content-type': `multipart/form-data; boundary=${b}` }, body });
  assert.equal(s.kind, 'multipart');
  assert.deepEqual(s.parts.map(p => [p.name, p.filename, p.bytes, p.magic]), [['transcription', null, 8, null], ['recording', 'memo.ogg', 304, 'ogg'], ['meta', null, 21, 'json']]);
  assert.equal(s.parts[0].value, 'Buy milk');
  assert.deepEqual(s.parts[2].value, { id: 'm1', ms: 8000 });
  assert.equal(s.parts[1].value, undefined, 'file part bytes are not stored');
});

test('binary and empty deliveries are described, never stored', () => {
  const s = summarizeDelivery({ method: 'POST', url: '/x', headers: { 'content-type': 'audio/wav', 'content-length': '9' }, body: Buffer.from('RIFF....WAVE') });
  assert.equal(s.kind, 'binary'); assert.equal(s.magic, 'wav'); assert.equal(s.bytes, 12);
  const e = summarizeDelivery({ method: 'POST', url: '/x', headers: {}, body: Buffer.alloc(0) });
  assert.equal(e.kind, 'empty');
  assert.equal(sniffMagic(Buffer.from('\x00\x00\x00\x18ftypM4A ')), 'mp4/m4a');
  assert.equal(summarizeMultipart(Buffer.from('x'), 'multipart/form-data').error, 'no boundary in content-type');
});

test('redactValue previews long non-text strings but keeps text-like fields', () => {
  assert.equal(redactValue('short', 'anything'), 'short');
  assert.match(redactValue('a'.repeat(500), 'blob'), /^<string len=500 base64/);
  assert.equal(redactValue('word '.repeat(100), 'note').length, 500);
});

test('runs ring keeps the newest ten', () => {
  let runs = [];
  for (let i = 0; i < 12; i++) runs = appendRun(runs, { i });
  assert.equal(runs.length, 10); assert.equal(runs[0].i, 11); assert.equal(runs[9].i, 2);
});

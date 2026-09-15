import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDelivery, redactValue, sniffMagic, summarizeMultipart, appendRun, pickHeaders } from '../lib/pebble-webhook.mjs';

test('headers keep content/user-agent/x-* and drop anything auth-like', () => {
  const h = pickHeaders({ 'content-type': 'application/json', 'user-agent': 'Pebble/1.0', 'x-pebble-event': 'memo', authorization: 'Bearer abc', cookie: 'a=b', 'x-signature': 'zz', host: 'x' });
  assert.deepEqual(h, { 'content-type': 'application/json', 'user-agent': 'Pebble/1.0', 'x-pebble-event': 'memo' });
  const proxy = pickHeaders({ 'x-index-trigger': 'single-click-hold', 'x-audio-size': '40822', 'x-vercel-sc-headers': '{"Authorization":"Bearer eyJhbGciOi..."}',
    'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4', 'x-vercel-ip-city': 'Town', 'x-invocation-id': 'iad1::x', 'x-custom': 'Bearer abc' });
  assert.deepEqual(proxy, { 'x-index-trigger': 'single-click-hold', 'x-audio-size': '40822' }, 'proxy internals and anything carrying a token are dropped');
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

// ---------------------------------------------------------------------------
// The real route (pages/api/pebble-webhook.js) with explicit dependencies: in-memory KV, a recording
// notifyDevices, and the real lib/pebble-memos.mjs / lib/pebble-webhook.mjs. Checks the wake-push decision.
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as pebbleWebhookLib from '../lib/pebble-webhook.mjs';
import * as pebbleMemos from '../lib/pebble-memos.mjs';

const WB = 'dac79c1d-7a4a-4861-9373-d663d631fc26';
const CTW = `multipart/form-data; boundary=${WB}`;
/** One Pebble delivery: m4a audio part (id from its filename), transcription, recordedAt, client. */
function pebbleDelivery() {
  const m4a = Buffer.concat([Buffer.from('\x00\x00\x00\x18ftypM4A '), Buffer.alloc(3000, 7)]);
  return Buffer.concat([
    Buffer.from(`--${WB}\r\nContent-Disposition: form-data; name="audio"; filename="ring_5F2FD2B5-ACDE-92B0-42DB-A32F0F8ACCD0-33-9978fd1f-d90c-4c2c-b492-7b9469b13477.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`), m4a, Buffer.from('\r\n'),
    Buffer.from(`--${WB}\r\nContent-Disposition: form-data; name="transcription"\r\n\r\nCheck with Lauren about the deck.\r\n`),
    Buffer.from(`--${WB}\r\nContent-Disposition: form-data; name="recordedAt"\r\n\r\n1789004265865\r\n`),
    Buffer.from(`--${WB}\r\nContent-Disposition: form-data; name="client"\r\n\r\nring\r\n`),
    Buffer.from(`--${WB}--\r\n`),
  ]);
}

class RouteKV {
  values = new Map(); zsets = new Map();
  async get(k) { return this.values.has(k) ? JSON.parse(this.values.get(k)) : null; }
  async set(k, v) { this.values.set(k, JSON.stringify(v)); }
  async del(k) { this.values.delete(k); this.zsets.delete(k); }
  #z(k) { if (!this.zsets.has(k)) this.zsets.set(k, new Map()); return this.zsets.get(k); }
  #sorted(k) { return [...(this.zsets.get(k) || new Map())].sort((a, b) => a[1] - b[1]).map(([m]) => m); }
  async zadd(k, ...pairs) { const z = this.#z(k); for (const { score, member } of pairs) z.set(member, score); return pairs.length; }
  async zrange(k, start, stop) { return this.#sorted(k).slice(start, stop === -1 ? undefined : stop + 1); }
  async zrem(k, ...members) { const z = this.#z(k); let n = 0; for (const m of members) if (z.delete(m)) n++; return n; }
  async zremrangebyrank(k, start, stop) { const all = this.#sorted(k); const to = stop < 0 ? all.length + stop + 1 : stop + 1; const doomed = to > start ? all.slice(start, to) : []; const z = this.#z(k); doomed.forEach(m => z.delete(m)); return doomed.length; }
}

async function webhookHarness() {
  const kv = new RouteKV();
  const pushes = [];
  const dependencies = {
    '@vercel/kv': { kv },
    auth: { requireAuth: async (req, res) => { if (req.headers?.authorization !== 'Bearer test-one') { res.status(401).json({ error: 'Authentication required' }); return null; } return 'user-one'; } },
    alerts: { withIngestAlert: (_source, handler) => handler },
    'pebble-webhook.mjs': pebbleWebhookLib,
    'pebble-memos.mjs': pebbleMemos,
    'apns.mjs': { notifyDevices: async (_kv, userId, { memo }) => { pushes.push({ userId, memoId: memo.id }); return { sent: 1, failed: 0, forgotten: 0 }; } },
  };
  const context = createContext({ process: { env: {} }, console: { log() {}, error() {} }, Buffer });
  const source = await readFile(new URL('../pages/api/pebble-webhook.js', import.meta.url), 'utf8');
  const module = new SourceTextModule(source, { context });
  await module.link(specifier => {
    const name = specifier === '@vercel/kv' ? specifier : specifier.split('/').at(-1);
    const exports = dependencies[name];
    assert.ok(exports, `Unexpected route dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const handler = module.namespace.default;
  const post = async (body) => {
    const listeners = {};
    const req = { method: 'POST', url: '/api/pebble-webhook', headers: { authorization: 'Bearer test-one', 'content-type': CTW, 'x-index-trigger': 'single-click-hold' },
      on(event, cb) { listeners[event] = cb; return this; } };
    const res = { statusCode: 200, body: undefined, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = JSON.parse(JSON.stringify(b)); return this; }, end() { return this; } };
    const done = handler(req, res);
    await new Promise(r => setImmediate(r));   // readBody has registered its listeners
    listeners.data(body); listeners.end();
    await done;
    return res;
  };
  return { kv, pushes, post };
}

test('webhook route: a new memo and a repaired retry both wake the phone; a done duplicate does not', async () => {
  const { kv, pushes, post } = await webhookHarness();
  const first = await post(pebbleDelivery());
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.body.memo, { id: '9978fd1f-d90c-4c2c-b492-7b9469b13477', queued: true, duplicate: false, repaired: false });
  assert.equal(pushes.length, 1, 'new memo → one push');

  // Same memo again while still pending on the server (the state a crash between record and queue leaves,
  // or a plain Pebble retry): membership is repaired and the phone is woken again.
  const retry = await post(pebbleDelivery());
  assert.deepEqual(retry.body.memo, { id: '9978fd1f-d90c-4c2c-b492-7b9469b13477', queued: true, duplicate: false, repaired: true });
  assert.equal(pushes.length, 2, 'repaired retry → another push');
  assert.equal(retry.body.push.sent, 1);
  assert.deepEqual((await pebbleMemos.listPending(kv, 'user-one')).map(m => m.id), ['9978fd1f-d90c-4c2c-b492-7b9469b13477']);

  // Once the phone has acked it, a late retry is a plain duplicate: no push, not re-queued.
  await pebbleMemos.ackMemo(kv, 'user-one', '9978fd1f-d90c-4c2c-b492-7b9469b13477');
  const late = await post(pebbleDelivery());
  assert.deepEqual(late.body.memo, { id: '9978fd1f-d90c-4c2c-b492-7b9469b13477', queued: false, duplicate: true, repaired: false });
  assert.equal(late.body.push, null);
  assert.equal(pushes.length, 2, 'done duplicate → no push');
  assert.deepEqual(await pebbleMemos.listPending(kv, 'user-one'), []);
});

// PRD-15 WP-C: the real pages/api/applaud-webhook.js with an in-memory KV, a signed body, a stubbed Gemini
// (lib/extract) and the real lib/meeting-store.js / lib/applaud-ingest.mjs / lib/relationships-store.mjs.
// Covers R16 (payload participants + meeting_source win over Gemini's guess) and R17 (transcript_updated).
// Contract: docs/applaud-webhook-contract.md. Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as taskStore from '../lib/task-store.mjs';
import * as captureIdempotency from '../lib/capture-idempotency.mjs';
import * as relationshipsStore from '../lib/relationships-store.mjs';
import * as applaudIngest from '../lib/applaud-ingest.mjs';
import { CAS_SCRIPT } from '../lib/cas.mjs';

const USER = 'user-one';
const SECRET = 'test-signing-secret';

// In-memory @vercel/kv: JSON values, MGET, the shared CAS Lua, sorted sets.
class MemoryKV {
  values = new Map(); zsets = new Map();
  async get(k) { return this.values.has(k) ? JSON.parse(this.values.get(k)) : null; }
  async mget(...keys) { return keys.map(k => (this.values.has(k) ? JSON.parse(this.values.get(k)) : null)); }
  async set(k, v) { this.values.set(k, JSON.stringify(v)); }
  async del(k) { this.values.delete(k); this.zsets.delete(k); }
  async eval(script, keys, args) {
    assert.ok(script === CAS_SCRIPT || script === taskStore.TASKS_CAS_SCRIPT, 'only the CAS script is expected');
    const [key, versionKey] = keys, [json, expected] = args;
    const current = this.values.has(versionKey) ? String(JSON.parse(this.values.get(versionKey))) : '0';
    if (current !== expected) return 0;
    this.values.set(key, json);
    this.values.set(versionKey, String(Number(current) + 1));
    return 1;
  }
  #z(k) { if (!this.zsets.has(k)) this.zsets.set(k, new Map()); return this.zsets.get(k); }
  #sorted(k) { return [...(this.zsets.get(k) || new Map())].sort((a, b) => a[1] - b[1]).map(([m]) => m); }
  async zadd(k, ...pairs) { const z = this.#z(k); let n = 0; for (const { score, member } of pairs) { if (!z.has(member)) n++; z.set(member, score); } return n; }
  async zrange(k, start, stop) { return this.#sorted(k).slice(start, stop === -1 ? undefined : stop + 1); }
  async zrem(k, ...members) { const z = this.#z(k); let n = 0; for (const m of members) if (z.delete(m)) n++; return n; }
  async zcard(k) { return this.zsets.get(k)?.size ?? 0; }
  async zremrangebyrank(k, start, stop) { const all = this.#sorted(k); const to = stop < 0 ? all.length + stop + 1 : stop + 1; const doomed = to > start ? all.slice(start, to) : []; const z = this.#z(k); doomed.forEach(m => z.delete(m)); return doomed.length; }
  meetings() { return JSON.parse(this.values.get('meetings') || '[]'); }
  tasks() { return JSON.parse(this.values.get('tasks') || '[]'); }
  transcript(id) { const raw = this.values.get(`meeting:${id}:transcript`); return raw ? JSON.parse(raw).text : null; }
  person(contactId) { const raw = this.values.get(relationshipsStore.personKey(USER, contactId)); return raw ? JSON.parse(raw) : null; }
}

const GEMINI_GUESS = ['Someone Gemini Guessed', 'Nikesh'];
const EXTRACTED = { meeting: { title: 'Q4 Planning', participants: GEMINI_GUESS, summary: 'Budget and hiring.' }, tasks: [{ task: 'Send the budget deck', owner: 'Me' }] };

/** Load the route (and lib/meeting-store.js, which is ESM-syntax .js) through the vm linker with explicit deps. */
async function routeHarness({ env = {}, extracted = EXTRACTED } = {}) {
  const kv = new MemoryKV();
  const geminiCalls = [];
  const alerts = [];
  const context = createContext({ process: { env: { INBOUND_EMAIL_USER_ID: USER, APPLAUD_WEBHOOK_SECRET: SECRET, ...env } }, console: { log() {}, error() {} }, Buffer, setTimeout });
  const dependencies = {
    '@vercel/kv': { kv },
    'node:crypto': { default: crypto },
    'task-store.mjs': taskStore,
    'capture-idempotency.mjs': captureIdempotency,
    'relationships-store.mjs': relationshipsStore,
    'applaud-ingest.mjs': applaudIngest,
    extract: {
      getKnownPeople: async () => [],
      extractWithGemini: async (text, opts) => { geminiCalls.push({ chars: text.length, people: opts?.people }); return { extracted }; },
      buildTaskRecords: (tasks, { userId, meetingId, sourceLabel, createdAt }) => (tasks || []).map((t, i) => ({ id: `t_${meetingId}_${i}`, userId, meetingId, task: t.task, owner: t.owner, source: sourceLabel, createdAt, status: 'uncategorized' })),
    },
    alerts: { withIngestAlert: (_source, handler) => handler, notifyIngestFailure: async (...args) => { alerts.push(args); } },
  };
  const sources = { 'meeting-store': '../lib/meeting-store.js' };
  async function link(specifier) {
    const name = specifier === '@vercel/kv' || specifier.startsWith('node:') ? specifier : specifier.split('/').at(-1);
    if (sources[name]) return load(sources[name]);
    const exports = dependencies[name];
    assert.ok(exports, `Unexpected route dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  }
  async function load(relativePath) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    const module = new SourceTextModule(source, { context });
    await module.link(link);
    return module;
  }
  const route = await load('../pages/api/applaud-webhook.js');
  await route.evaluate();
  const handler = route.namespace.default;

  const post = async (body, { sign = true } = {}) => {
    const raw = JSON.stringify(body);
    const headers = { 'content-type': 'application/json' };
    if (sign) headers['x-applaud-signature'] = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
    const req = { method: 'POST', url: '/api/applaud-webhook', headers, body: JSON.parse(raw) };
    const res = { statusCode: 200, body: undefined, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = JSON.parse(JSON.stringify(b)); return this; }, end() { return this; } };
    await handler(req, res);
    return res;
  };
  return { kv, post, geminiCalls, alerts };
}

const TRANSCRIPT = 'Speaker 1: Let us walk through the Q4 budget and the two open hires. Speaker 2: Agreed, and I will send the deck to finance after this call so they can review the numbers by Friday.';
const MERGED = `${TRANSCRIPT} Speaker 3: One more thing, the Teams transcript caught the part about the vendor renewal that the recorder missed entirely.`;
const RECORDING = { id: 'rec-42', filename: '10-14 Q4 Planning', start_time_ms: Date.parse('2026-10-14T15:00:00Z'), end_time_ms: Date.parse('2026-10-14T15:45:00Z'), duration_ms: 45 * 60_000 };
const TEAMS = ['Chhabria, Nikesh Kumar', 'Okafor, Dan', ' Chhabria, Nikesh Kumar ', 'okafor, dan'];

const ready = (extra = {}) => ({ event: 'transcript_ready', recording: RECORDING, content: { transcript_text: TRANSCRIPT, summary_markdown: '# Q4' }, ...extra });
const updated = (extra = {}) => ({ event: 'transcript_updated', recording: RECORDING, content: { transcript_text: MERGED, summary_markdown: '# Q4' }, participants: TEAMS, meeting_source: 'teams',
  enrichment: { dropFile: 'Q4 Planning.json', offsetSeconds: 3.2, clusters: { SPEAKER_03: { name: 'Nikesh Kumar Chhabria', purity: 0.91, votes: 40 } }, at: '2026-10-14T16:10:00Z' }, ...extra });

/** Seed a roster with one Teams-named contact so meeting signals have someone to touch. */
async function seedRoster(kv) {
  await kv.set('contacts', [
    { id: 'c_nikesh', userId: USER, name: 'Nikesh Kumar Chhabria', aliases: [], role: 'Lead', company: 'Ascend', relationshipContext: '', deleted: false },
    { id: 'c_other', userId: 'user-two', name: 'Dan Okafor', aliases: [], deleted: false },
  ]);
  await relationshipsStore.addToRoster(kv, USER, { contactId: 'c_nikesh', list: 'crew' });
}

test('transcript_ready: payload participants and meeting_source are stored over Gemini\'s guessed list', async () => {
  const { kv, post, geminiCalls } = await routeHarness();
  const res = await post(ready({ participants: TEAMS, meeting_source: 'teams' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.taskCount, 1);
  assert.equal(geminiCalls.length, 1, 'extraction still runs once');
  const [m] = kv.meetings();
  assert.equal(m.title, 'Q4 Planning');
  assert.equal(m.plaudRecordingId, 'rec-42');
  assert.deepEqual(m.participants, ['Chhabria, Nikesh Kumar', 'Okafor, Dan'], 'trimmed and de-duplicated, Gemini\'s guess discarded');
  assert.equal(m.meetingSource, 'teams');
  assert.equal(m.hasTranscript, true);
  assert.equal(m.transcriptLength, TRANSCRIPT.length);
  assert.equal(kv.transcript(m.id), TRANSCRIPT);
  assert.equal(kv.tasks().length, 1);
});

test('transcript_ready: without participants Gemini\'s list is kept and meetingSource is null', async () => {
  const { kv, post } = await routeHarness();
  assert.equal((await post(ready())).statusCode, 200);
  const [m] = kv.meetings();
  assert.deepEqual(m.participants, GEMINI_GUESS);
  assert.equal(m.meetingSource, null);

  // Junk shapes are treated as "none": not an array, empty, or no usable strings.
  const { kv: kv2, post: post2 } = await routeHarness();
  await post2(ready({ participants: [42, '', '   ', null], meeting_source: null, recording: { ...RECORDING, id: 'rec-43', start_time_ms: RECORDING.start_time_ms + 1 } }));
  assert.deepEqual(kv2.meetings()[0].participants, GEMINI_GUESS);
  assert.equal(kv2.meetings()[0].meetingSource, null);
});

test('transcript_updated: replaces transcript and participants, recomputes length, creates no tasks and never re-extracts', async () => {
  const { kv, post, geminiCalls } = await routeHarness();
  await post(ready());
  const [before] = kv.meetings();
  assert.deepEqual(before.participants, GEMINI_GUESS);

  const res = await post(updated());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { updated: true, meeting: { id: before.id, title: 'Q4 Planning' } });
  assert.equal(geminiCalls.length, 1, 'no second extraction');
  assert.equal(kv.tasks().length, 1, 'no new tasks');

  const [after] = kv.meetings();
  assert.equal(kv.meetings().length, 1, 'no second meeting');
  assert.equal(after.id, before.id);
  assert.deepEqual(after.participants, ['Chhabria, Nikesh Kumar', 'Okafor, Dan']);
  assert.equal(after.meetingSource, 'teams');
  assert.equal(after.transcriptLength, MERGED.length);
  assert.equal(after.hasTranscript, true);
  assert.equal(kv.transcript(after.id), MERGED);
  assert.ok(after.transcriptUpdatedAt);
  // Untouched by the update: title, summary, date, duration, tasks' meeting link.
  assert.equal(after.summary, before.summary);
  assert.equal(after.date, before.date);
  assert.equal(after.duration, before.duration);
  assert.equal(after.plaudStartTimeMs, before.plaudStartTimeMs);
  assert.equal(kv.tasks()[0].meetingId, before.id);
});

test('transcript_updated: 404 unknown_recording when no meeting has that plaudRecordingId; signature still enforced', async () => {
  const { kv, post } = await routeHarness();
  const res = await post(updated());
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'unknown_recording' });
  assert.deepEqual(kv.meetings(), []);
  assert.equal(kv.transcript('anything'), null);

  const unsigned = await post(updated(), { sign: false });
  assert.equal(unsigned.statusCode, 401);

  await post(ready());
  const otherRecording = await post(updated({ recording: { ...RECORDING, id: 'rec-99' } }));
  assert.equal(otherRecording.statusCode, 404, 'a different recording id does not match by start time');
  assert.deepEqual(kv.meetings()[0].participants, GEMINI_GUESS, 'the existing meeting is untouched');
});

test('transcript_updated: a repeat is a no-op, and a payload without a transcript keeps the stored one', async () => {
  const { kv, post } = await routeHarness();
  await post(ready());
  await post(updated());
  const first = kv.meetings()[0];
  const tasks = kv.tasks();

  const again = await post(updated());
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.body, { updated: true, meeting: { id: first.id, title: 'Q4 Planning' } });
  const { transcriptUpdatedAt: _a, ...repeat } = kv.meetings()[0];
  const { transcriptUpdatedAt: _b, ...initial } = first;
  assert.deepEqual(repeat, initial, 'nothing but the update timestamp moves');
  assert.deepEqual(kv.tasks(), tasks);
  assert.equal(kv.transcript(first.id), MERGED);

  const noText = await post(updated({ content: { transcript_text: '' }, participants: ['Solo, Han'], meeting_source: null }));
  assert.equal(noText.statusCode, 200);
  const m = kv.meetings()[0];
  assert.equal(kv.transcript(m.id), MERGED, 'stored transcript kept');
  assert.equal(m.transcriptLength, MERGED.length);
  assert.deepEqual(m.participants, ['Solo, Han']);
  assert.equal(m.meetingSource, null);
});

test('a roster person named "Last, First" gets exactly one meeting touch across transcript_ready and transcript_updated', async () => {
  const { kv, post } = await routeHarness();
  await seedRoster(kv);

  // Gemini only guessed a bare first name here; "Nikesh" resolves to the single contact starting with it.
  await post(ready());
  const [m] = kv.meetings();
  let person = kv.person('c_nikesh');
  assert.equal(person.touches.length, 1, 'transcript_ready touches via Gemini\'s guess');
  assert.equal(person.touches[0].sourceRef, `meeting:${m.id}`);
  assert.equal(person.touches[0].channel, 'meeting');
  assert.equal(person.touches[0].confidence, 'high');

  await post(updated());
  await post(updated());
  person = kv.person('c_nikesh');
  assert.equal(person.touches.length, 1, 'sourceRef meeting:<id> de-dupes the update and its repeat');

  // A meeting whose first transcript named nobody: the Teams roster arriving later is what creates the touch.
  const { kv: kv2, post: post2 } = await routeHarness({ extracted: { meeting: { title: 'Vendor Sync', participants: [], summary: 'Renewal terms.' }, tasks: [] } });
  await seedRoster(kv2);
  await post2(ready());
  assert.equal(kv2.person('c_nikesh')?.touches?.length ?? 0, 0, 'nobody named yet');
  await post2(updated());
  const touches = kv2.person('c_nikesh').touches;
  assert.equal(touches.length, 1, '"Chhabria, Nikesh Kumar" matches contact "Nikesh Kumar Chhabria"');
  assert.equal(touches[0].sourceRef, `meeting:${kv2.meetings()[0].id}`);
  await post2(updated());
  assert.equal(kv2.person('c_nikesh').touches.length, 1);
});

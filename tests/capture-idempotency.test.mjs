// Unit/route tests: node --experimental-vm-modules --test tests/capture-idempotency.test.mjs
// Also exercise real Redis Lua, using a cached image and no network:
// CAPTURE_REDIS_TESTS=1 node --experimental-vm-modules --test tests/capture-idempotency.test.mjs
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { VercelKV } from '@vercel/kv';
import * as idempotency from '../lib/capture-idempotency.mjs';

const { captureIdentity, findCaptureResponse, captureTaskIDs, commitCapture, CaptureIdempotencyError } = idempotency;
const CAPTURE_ID = '4dc8d1b7-2f24-424e-abcf-3a2777a919a0';
const OTHER_ID = '271c391b-346b-45e0-95df-aa3c4c625671';
const TRANSCRIPT = 'Send the report tomorrow.';
const identity = (id = CAPTURE_ID, userId = 'user-one', transcript = TRANSCRIPT) =>
  captureIdentity({ headers: {}, body: { captureID: id } }, userId, transcript);

function records(capture, { task = 'Send the report', transcript = TRANSCRIPT } = {}) {
  const meeting = { id: capture.meetingID, userId: capture.userId, title: 'Report', transcript, participants: [] };
  const tasks = captureTaskIDs(capture, [{ id: 'timestamp-id', userId: capture.userId, meetingId: meeting.id, task, activity: [] }]);
  return { meeting, tasks, response: { success: true, meeting: { id: meeting.id, title: meeting.title }, tasks } };
}

class MemoryKV {
  values = new Map();
  reads = 0;
  writes = 0;
  failRead = false;
  failBeforeCommit = false;
  failAfterCommit = false;
  async get(key) {
    this.reads++;
    if (this.failRead) throw new Error('Synthetic connection failure');
    return this.values.has(key) ? JSON.parse(this.values.get(key)) : null;
  }
  async eval(script, keys, args) {
    assert.equal(script, idempotency.CAPTURE_COMMIT_SCRIPT);
    if (this.failBeforeCommit) throw new Error('Synthetic pre-commit failure');
    const [receiptKey, meetingsKey, tasksKey, transcriptKey] = keys;
    const previous = this.values.has(receiptKey) ? JSON.parse(this.values.get(receiptKey)) : null;
    if (previous) return previous.fingerprint === args[0] ? ['replay', previous.response] : ['conflict'];
    const meetings = JSON.parse(this.values.get(meetingsKey) || '[]');
    const tasks = JSON.parse(this.values.get(tasksKey) || '[]');
    if (!Array.isArray(meetings) || !Array.isArray(tasks)) return ['unavailable'];
    // This fake models one atomic commit; the Docker suite below tests the actual Lua script.
    this.values.set(meetingsKey, JSON.stringify([JSON.parse(args[1]), ...meetings]));
    this.values.set(tasksKey, JSON.stringify([...JSON.parse(args[2]), ...tasks]));
    this.values.set(transcriptKey, args[3]);
    this.values.set(receiptKey, args[4]);
    this.writes++;
    if (this.failAfterCommit) {
      this.failAfterCommit = false;
      throw new Error('Synthetic response loss after commit');
    }
    return ['stored', JSON.parse(args[4]).response];
  }
}

function response() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

// Load the real route code with explicit dependencies. No env files, credentials,
// Gemini requests, hosted KV calls or alert notifications can reach these tests.
async function routeHarness(kv) {
  const calls = { parse: 0, legacySave: 0, alerts: 0 };
  const dependencies = {
    '@vercel/kv': { kv },
    auth: { requireAuth: async (req, res) => {
      const users = { 'Bearer test-one': 'user-one', 'Bearer test-two': 'user-two' };
      const user = users[req.headers?.authorization];
      if (!user) res.status(401).json({ error: 'Authentication required' });
      return user || null;
    } },
    'meeting-store': { addMeetingWithTasks: async () => { calls.legacySave++; } },
    extract: {
      getKnownPeople: async () => [],
      localDateOrToday: date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : '2026-09-05',
      extractWithGemini: async () => {
        calls.parse++;
        await Promise.resolve();
        return { extracted: { meeting: { title: 'Server report', summary: 'A report' }, tasks: [{ task: 'Server task' }] } };
      },
      buildTaskRecords: (tasks, { userId, meetingId }) => (tasks || []).map((task, index) => ({
        ...task, id: `t_same_millisecond_${index}`, userId, meetingId, activity: [],
      })),
    },
    alerts: {
      notifyIngestFailure: async () => { calls.alerts++; },
      withIngestAlert: (_, handler) => handler,
    },
    'capture-idempotency.mjs': idempotency,
  };
  async function load(relativePath) {
    const context = createContext({ process: { env: { CAPTURE_SECRET: 'test-secret', INBOUND_EMAIL_USER_ID: 'user-one' } },
      console: { log() {}, error() {} } });
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    const module = new SourceTextModule(source, { context });
    await module.link(specifier => {
      const name = specifier === '@vercel/kv' ? specifier : specifier.split('/').at(-1);
      const exports = dependencies[name];
      assert.ok(exports, `Unexpected route dependency: ${specifier}`);
      return new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    });
    await module.evaluate();
    return module.namespace.default;
  }
  const quick = await load('../pages/api/quick-capture.js');
  const structured = await load('../pages/api/capture/structured.js');
  return {
    calls,
    async request(kind, { id = CAPTURE_ID, transcript = TRANSCRIPT, headers = {}, body = {}, authorized = true } = {}) {
      const req = { method: 'POST', headers: {
        ...(authorized ? kind === 'quick' ? { 'x-capture-secret': 'test-secret' } : { authorization: 'Bearer test-one' } : {}),
        ...(id ? { 'idempotency-key': id } : {}), ...headers,
      }, body: { ...(kind === 'quick' ? { text: transcript } : { transcript,
        clientParse: { engine: 'apple-fm', title: 'Client report', tasks: [{ task: 'Client task' }] } }),
        ...(id ? { captureID: id } : {}), source: 'watch', localDate: '2026-09-05', recordedAt: 1788613200000, ...body } };
      const res = response();
      await (kind === 'quick' ? quick : structured)(req, res);
      return res;
    },
  };
}

describe('capture identity', () => {
  test('is optional, canonicalizes UUIDs, and binds to transcript independently of route/parser', () => {
    assert.equal(captureIdentity({ headers: {}, body: {} }, 'user-one', TRANSCRIPT), null);
    const capture = captureIdentity({ headers: { 'idempotency-key': CAPTURE_ID.toUpperCase() },
      body: { captureID: CAPTURE_ID, clientParse: { tasks: [] } } }, 'user-one', `  ${TRANSCRIPT}  `);
    assert.deepEqual(capture, identity());
    assert.notEqual(identity(CAPTURE_ID, 'user-two').key, capture.key);
    assert.notEqual(identity(CAPTURE_ID, 'user-two').meetingID, capture.meetingID);
    assert.notEqual(identity(CAPTURE_ID, 'user-one', 'Different memo').fingerprint, capture.fingerprint);
  });

  test('rejects malformed, repeated, and inconsistent identifiers', () => {
    for (const req of [
      { headers: {}, body: { captureID: 'not-a-uuid' } },
      { headers: { 'idempotency-key': [CAPTURE_ID, CAPTURE_ID] }, body: {} },
      { headers: { 'idempotency-key': OTHER_ID }, body: { captureID: CAPTURE_ID } },
    ]) assert.throws(() => captureIdentity(req, 'user-one', TRANSCRIPT), error => error.status === 400);
  });

  test('dryRun does not acquire a key or inspect prior receipts', async () => {
    const capture = captureIdentity({ headers: { 'idempotency-key': CAPTURE_ID }, body: { dryRun: true, captureID: CAPTURE_ID } }, 'user-one', TRANSCRIPT);
    assert.equal(capture, null);
    const kv = new MemoryKV();
    assert.equal(await findCaptureResponse(kv, capture), null);
    assert.equal(kv.reads, 0);
  });

  test('unavailable or corrupt receipt reads fail closed', async () => {
    const kv = new MemoryKV();
    kv.failRead = true;
    await assert.rejects(findCaptureResponse(kv, identity()), error => error.status === 503);
    kv.failRead = false;
    kv.values.set(identity().key, JSON.stringify({ version: 1, fingerprint: identity().fingerprint, response: 'broken' }));
    await assert.rejects(findCaptureResponse(kv, identity()), error => error.status === 503);
    assert.equal(kv.writes, 0);
  });
});

describe('capture HTTP routes', () => {
  test('retries across both routes return the exact original response without re-parsing', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    const first = await routes.request('structured');
    const retry = await routes.request('quick');
    assert.equal(first.statusCode, 200);
    assert.equal(retry.statusCode, 200);
    assert.deepEqual(retry.body, first.body);
    assert.equal(routes.calls.parse, 0);
    assert.equal(kv.writes, 1);
    assert.equal((await kv.get('meetings')).length, 1);
    assert.equal((await kv.get('tasks')).length, 1);
  });

  test('simultaneous cross-route retries commit once and return the winning parse', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    const results = await Promise.all([routes.request('quick'), routes.request('structured'), routes.request('quick')]);
    for (const result of results) {
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.body, results[0].body);
    }
    assert.equal(kv.writes, 1);
  });

  test('a lost commit response returns retryable 503 and then replays the durable result', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    kv.failAfterCommit = true;
    const lost = await routes.request('structured');
    assert.equal(lost.statusCode, 503);
    assert.equal(lost.headers['Retry-After'], '3');
    const retry = await routes.request('quick');
    assert.equal(retry.statusCode, 200);
    assert.equal(kv.writes, 1);
    assert.equal((await kv.get('meetings')).length, 1);
    assert.equal((await kv.get('tasks')).length, 1);
    assert.equal((await kv.get(`meeting:${retry.body.meeting.id}:transcript`)).text, TRANSCRIPT);
  });

  test('a pre-commit failure writes nothing and permits retry with the same ID', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    kv.failBeforeCommit = true;
    assert.equal((await routes.request('structured')).statusCode, 503);
    assert.equal(kv.values.size, 0);
    kv.failBeforeCommit = false;
    assert.equal((await routes.request('structured')).statusCode, 200);
    assert.equal(kv.writes, 1);
  });

  test('different transcript reuse is rejected with 409 before parsing or writing', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    await routes.request('structured');
    const conflict = await routes.request('quick', { transcript: 'Unrelated recording.' });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.body.code, 'capture_id_conflict');
    assert.equal(kv.writes, 1);
    assert.equal(routes.calls.parse, 0);
  });

  test('unauthenticated requests cannot read another user receipt', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    await routes.request('structured');
    const before = kv.reads;
    for (const kind of ['quick', 'structured']) {
      assert.equal((await routes.request(kind, { authorized: false })).statusCode, 401);
    }
    assert.equal(kv.reads, before);
    assert.equal(kv.writes, 1);
  });

  test('different users can use the same UUID and receive separate records', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    const first = await routes.request('structured');
    const second = await routes.request('structured', { headers: { authorization: 'Bearer test-two' } });
    assert.equal(second.statusCode, 200);
    assert.notEqual(first.body.meeting.id, second.body.meeting.id);
    assert.notEqual(first.body.tasks[0].id, second.body.tasks[0].id);
    assert.equal((await kv.get('meetings')).length, 2);
  });

  test('distinct concurrent captures keep both meetings and unique task IDs', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    const [first, second] = await Promise.all([routes.request('structured'), routes.request('structured', { id: OTHER_ID })]);
    assert.notEqual(first.body.tasks[0].id, second.body.tasks[0].id);
    assert.equal((await kv.get('meetings')).length, 2);
    assert.equal((await kv.get('tasks')).length, 2);
  });

  test('dryRun bypasses existing receipts and never writes through either route', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    await routes.request('structured');
    const readsBefore = kv.reads;
    for (const kind of ['quick', 'structured']) {
      const result = await routes.request(kind, { transcript: 'A different evaluation memo.', body: { dryRun: true } });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.dryRun, true);
    }
    assert.equal(kv.reads, readsBefore);
    assert.equal(kv.writes, 1);
    assert.equal(routes.calls.legacySave, 0);
  });

  test('legacy requests retain the existing save path and response shapes', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    for (const kind of ['quick', 'structured']) {
      const result = await routes.request(kind, { id: null });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.success, true);
      assert.equal(result.body.tasks.length, 1);
    }
    assert.equal(routes.calls.legacySave, 2);
    assert.equal(kv.reads, 0);
    assert.equal(kv.writes, 0);
  });

  test('key mismatches return 400 and unavailable storage returns 503 before extraction', async () => {
    const kv = new MemoryKV(), routes = await routeHarness(kv);
    const bad = await routes.request('quick', { body: { captureID: OTHER_ID } });
    assert.equal(bad.statusCode, 400);
    assert.equal(routes.calls.alerts, 0);          // a client mistake is not an operator alert
    kv.failRead = true;
    const unavailable = await routes.request('quick');
    assert.equal(unavailable.statusCode, 503);
    assert.equal(routes.calls.parse, 0);
    assert.equal(routes.calls.alerts, 1);          // storage outages page the operator (ntfy)
    assert.equal(kv.writes, 0);
  });
});

describe('actual Redis atomic commit', { skip: process.env.CAPTURE_REDIS_TESTS !== '1' }, () => {
  const run = promisify(execFile);
  let container;
  let kv;
  async function command(...args) {
    const { stdout } = await run('docker', ['exec', container, 'redis-cli', '--json', ...args.map(String)], { maxBuffer: 1024 * 1024 });
    return JSON.parse(stdout.trim());
  }
  before(async () => {
    const { stdout } = await run('docker', ['run', '--pull=never', '--rm', '--detach', '--network', 'none', '--tmpfs', '/data',
      'redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
    container = stdout.trim();
    assert.match(container, /^[a-f0-9]{64}$/);
    for (let attempt = 0; ; attempt++) {
      try { assert.equal(await command('PING'), 'PONG'); break; }
      catch (error) {
        if (attempt === 20) throw error;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    // Exercise the production SDK's serialization too, with all transport redirected
    // to this network-disabled Redis container through a custom Requester.
    kv = new VercelKV({ request: async ({ body }) => ({ result: await command(...body) }) });
  });
  after(async () => {
    if (container && /^[a-f0-9]{64}$/.test(container)) await run('docker', ['stop', container]);
  });
  beforeEach(async () => { await command('FLUSHDB'); }); // Isolated disposable container only.

  test('concurrent retries execute Lua and commit exactly one response', async () => {
    const capture = identity();
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      commitCapture(kv, capture, records(capture, { task: `Candidate ${index}` }))));
    for (const result of results) assert.deepEqual(result, results[0]);
    assert.equal((await kv.get('meetings')).length, 1);
    assert.equal((await kv.get('tasks')).length, 1);
    assert.deepEqual(await kv.get(`meeting:${capture.meetingID}:transcript`), { text: TRANSCRIPT });
    assert.deepEqual(await findCaptureResponse(kv, capture), results[0]);
    assert.equal(await command('TTL', capture.key), -1);
  });

  test('commits against multi-megabyte existing arrays without Lua pattern limits', async () => {
    // Production hit "pattern/input too complex" once the tasks array passed ~1 MB. Build the arrays inside
    // Redis (docker exec cannot carry values this large as arguments) and verify by inspecting in Lua.
    const build = `
      local item = '{"id":"old","pad":"' .. string.rep('a', 500) .. '"},'
      local tasks = '[' .. string.rep(item, 4000) .. '{"id":"last-task"}]'
      redis.call('SET', KEYS[1], tasks)
      redis.call('SET', KEYS[2], '[' .. string.rep('{"id":"m"},', 800) .. '{"id":"last-meeting"}]')
      return #tasks`;
    const size = await command('EVAL', build, 2, 'tasks', 'meetings');
    assert.ok(size > 2_000_000, `expected > 2 MB of tasks, got ${size}`);
    const capture = identity();
    const result = await commitCapture(kv, capture, records(capture, { task: 'Large store' }));
    assert.equal(result.success, true);
    const inspect = `
      local t = redis.call('GET', 'tasks'); local m = redis.call('GET', 'meetings')
      return {string.sub(t, 1, 40), string.sub(t, -20), string.sub(m, 1, 40), string.sub(m, -23)}`;
    const [tHead, tTail, mHead, mTail] = await command('EVAL', inspect, 0);
    assert.match(tHead, /^\[\{"id":"t_capture_/);
    assert.ok(tTail.endsWith('{"id":"last-task"}]'), tTail);
    assert.match(mHead, /^\[\{"id":"m_capture_/);
    assert.ok(mTail.endsWith('{"id":"last-meeting"}]'), mTail);
    assert.deepEqual(await findCaptureResponse(kv, capture), result);
  });

  test('distinct simultaneous commits preserve existing raw JSON and append both captures', async () => {
    const existingTasks = '[{"id":"existing","nested":[],"precise":900719925474099312345}]';
    await command('SET', 'tasks', existingTasks);
    await command('SET', 'meetings', '[{"id":"existing","participants":[]}]');
    const first = identity(), second = identity(OTHER_ID);
    await Promise.all([commitCapture(kv, first, records(first)), commitCapture(kv, second, records(second))]);
    assert.equal((await kv.get('meetings')).length, 3);
    assert.equal((await kv.get('tasks')).length, 3);
    assert.ok((await command('GET', 'tasks')).includes('"precise":900719925474099312345'));
    assert.ok((await command('GET', 'tasks')).includes('"nested":[]'));
    assert.deepEqual((await kv.get('meetings'))[0].participants, []);
  });

  test('response loss after the real transaction is recoverable without another write', async () => {
    const capture = identity(), payload = records(capture);
    const lostResponseKV = { ...kv, eval: async (...args) => {
      await kv.eval(...args);
      throw new Error('Synthetic network failure after Redis committed');
    } };
    await assert.rejects(commitCapture(lostResponseKV, capture, payload), error => error.status === 503);
    assert.deepEqual(await findCaptureResponse(kv, capture), payload.response);
    assert.deepEqual(await commitCapture(kv, capture, records(capture, { task: 'Different retry parse' })), payload.response);
    assert.equal((await kv.get('meetings')).length, 1);
    assert.equal((await kv.get('tasks')).length, 1);
  });

  test('invalid existing storage fails before any of the four writes', async () => {
    const capture = identity();
    await command('SET', 'meetings', '[{"id":"keep"}]');
    await command('SET', 'tasks', '{}');
    await assert.rejects(commitCapture(kv, capture, records(capture)), error => error.status === 503);
    assert.equal(await command('GET', 'meetings'), '[{"id":"keep"}]');
    assert.equal(await command('GET', 'tasks'), '{}');
    assert.equal(await kv.get(capture.key), null);
    assert.equal(await kv.get(`meeting:${capture.meetingID}:transcript`), null);
  });

  test('size rejection occurs before writing records or a receipt', async () => {
    const capture = identity();
    const smallLimitKV = { ...kv, eval: (script, keys, args) => kv.eval(script, keys, [...args.slice(0, 5), 100]) };
    await assert.rejects(commitCapture(smallLimitKV, capture, records(capture)), error => error.code === 'capture_storage_full');
    assert.equal(await command('DBSIZE'), 0);
  });

  test('different transcript collision returns 409 in the transaction itself', async () => {
    const capture = identity();
    await commitCapture(kv, capture, records(capture));
    const conflicting = identity(CAPTURE_ID, 'user-one', 'Different transcript');
    await assert.rejects(commitCapture(kv, conflicting, records(conflicting, { transcript: 'Different transcript' })), error => error.status === 409);
    assert.equal((await kv.get('meetings')).length, 1);
  });

  test('empty tasks remain an array, including on replay', async () => {
    const capture = identity(), payload = records(capture);
    payload.tasks = [];
    payload.response.tasks = [];
    await commitCapture(kv, capture, payload);
    assert.equal(await command('GET', 'tasks'), '[]');
    assert.deepEqual((await findCaptureResponse(kv, capture)).tasks, []);
    assert.deepEqual((await kv.get('meetings'))[0].participants, []);
  });

  test('an unexpectedly missing receipt cannot duplicate its existing records', async () => {
    const capture = identity();
    await commitCapture(kv, capture, records(capture));
    await command('DEL', capture.key);
    await assert.rejects(commitCapture(kv, capture, records(capture)), error => error.status === 503);
    assert.equal((await kv.get('meetings')).length, 1);
    assert.equal((await kv.get('tasks')).length, 1);
  });
});

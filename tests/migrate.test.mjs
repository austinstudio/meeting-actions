// POST /api/migrate: the one-time "assign everything to me" route. Loads the real route with explicit
// dependencies (no next-auth, no hosted KV) and checks every phase runs under compare-and-set.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as taskStore from '../lib/task-store.mjs';
import { updateMeetings, MEETINGS_VERSION_KEY, MeetingStoreError } from '../lib/capture-idempotency.mjs';

const { TASKS_CAS_SCRIPT } = taskStore;

/** JSON-string values plus the compare-and-set Lua both stores run (same script, different keys). */
class MemoryKV {
  values = new Map(); writes = 0; failSetOf = null;
  seed(key, value) { this.values.set(key, JSON.stringify(value)); return this; }
  async get(key) { return this.values.has(key) ? JSON.parse(this.values.get(key)) : null; }
  async set(key, value) { if (this.failSetOf === key) throw new Error(`injected failure writing ${key}`); this.values.set(key, JSON.stringify(value)); this.writes++; }
  async eval(script, keys, args) {
    assert.equal(script, TASKS_CAS_SCRIPT);
    const [dataKey, versionKey] = keys, [json, expected] = args;
    const current = this.values.has(versionKey) ? String(JSON.parse(this.values.get(versionKey))) : '0';
    if (current !== expected) return 0;
    this.values.set(dataKey, json);
    this.values.set(versionKey, String(Number(current) + 1));
    this.writes++;
    return 1;
  }
}

async function migrateHarness(kv) {
  const dependencies = {
    '@vercel/kv': { kv },
    auth: { requireAuth: async (req, res) => { if (req.headers?.authorization !== 'Bearer test-one') { res.status(401).json({ error: 'Authentication required' }); return null; } return 'user-one'; } },
    'task-store.mjs': taskStore,
    'meeting-store': { updateMeetings, MEETINGS_VERSION_KEY, MeetingStoreError },
  };
  const context = createContext({ process: { env: {} }, console: { log() {}, error() {} } });
  const source = await readFile(new URL('../pages/api/migrate.js', import.meta.url), 'utf8');
  const module = new SourceTextModule(source, { context });
  await module.link(specifier => {
    const name = specifier === '@vercel/kv' ? specifier : specifier.split('/').at(-1);
    const exports = dependencies[name];
    assert.ok(exports, `Unexpected route dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const handler = module.namespace.default;
  return async (method = 'POST', authorization = 'Bearer test-one') => {
    const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = JSON.parse(JSON.stringify(b)); return this; }, end() { return this; } };
    await handler({ method, headers: { authorization }, query: {}, body: {} }, res);
    return res;
  };
}

function seeded() {
  return new MemoryKV()
    .seed('tasks', [{ id: 't1', task: 'mine already', userId: 'user-one' }, { id: 't2', task: 'orphan' }, { id: 't3', task: 'someone else', userId: 'user-two' }])
    .seed('meetings', [{ id: 'm1', title: 'orphan meeting' }, { id: 'm2', title: 'owned', userId: 'user-two' }])
    .seed('columns', [{ id: 'todo', label: 'To do' }, { id: 'c1', label: 'Custom', custom: true }, { id: 'c2', label: 'Theirs', custom: true, userId: 'user-two' }]);
}

test('migrate assigns orphaned tasks, meetings and custom columns to the caller under compare-and-set', async () => {
  const kv = seeded();
  const call = await migrateHarness(kv);
  const res = await call();
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.migrated, { tasks: 1, meetings: 1, columns: 1 });
  assert.match(res.body.message, /Migrated 1 tasks, 1 meetings, and 1 custom columns/);
  assert.deepEqual((await kv.get('tasks')).map(t => t.userId), ['user-one', 'user-one', 'user-two']);
  assert.deepEqual((await kv.get('meetings')).map(m => m.userId), ['user-one', 'user-two']);
  assert.deepEqual((await kv.get('columns')).map(c => c.userId), [undefined, 'user-one', 'user-two']);
  assert.equal(await kv.get('tasks:version'), 1, 'tasks written through the CAS script');
  assert.equal(await kv.get(MEETINGS_VERSION_KEY), 1, 'meetings written through the CAS script');

  const again = await call();
  assert.deepEqual(again.body.migrated, { tasks: 0, meetings: 0, columns: 0 }, 'idempotent');
});

test('migrate rejects other methods and unauthenticated callers', async () => {
  const call = await migrateHarness(seeded());
  assert.equal((await call('GET')).statusCode, 405);
  assert.equal((await call('POST', 'Bearer nope')).statusCode, 401);
});

test('a failure part-way through answers 500 and leaves the earlier phases written', async () => {
  const kv = seeded();
  kv.failSetOf = 'columns';
  const call = await migrateHarness(kv);
  const res = await call();
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Migration failed' });
  assert.equal((await kv.get('tasks'))[1].userId, 'user-one', 'tasks phase had already committed');
  assert.equal((await kv.get('meetings'))[0].userId, 'user-one', 'meetings phase had already committed');
  assert.equal((await kv.get('columns'))[1].userId, undefined, 'columns never written');
});

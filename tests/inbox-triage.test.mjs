// Quick Notes Triage mode support: GET /api/capture/inbox, GET /api/capture/board, triage stats,
// and the PATCH/DELETE task contract the phone relies on. Run with: npm test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as taskStore from '../lib/task-store.mjs';
import * as triageStats from '../lib/triage-stats.mjs';
import * as captureBoard from '../lib/capture-board.mjs';
import * as constants from '../components/constants.js';

const { TASKS_CAS_SCRIPT } = taskStore;
const { computeTriageStats } = triageStats;

// Minimal stand-in for @vercel/kv: JSON-string values, `get`, and the compare-and-set Lua
// that lib/task-store.mjs runs (modelled the same way as tests/capture-idempotency.test.mjs).
class MemoryKV {
  values = new Map();
  reads = 0;
  writes = 0;
  seed(key, value) { this.values.set(key, JSON.stringify(value)); return this; }
  async get(key) { this.reads++; return this.values.has(key) ? JSON.parse(this.values.get(key)) : null; }
  async eval(script, keys, args) {
    assert.equal(script, TASKS_CAS_SCRIPT);
    const [tasksKey, versionKey] = keys, [json, expected] = args;
    const current = this.values.has(versionKey) ? String(JSON.parse(this.values.get(versionKey))) : '0';
    if (current !== expected) return 0;
    this.values.set(tasksKey, json);
    this.values.set(versionKey, String(Number(current) + 1));
    this.writes++;
    return 1;
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

const BEARER = { 'user-one': 'Bearer test-one', 'user-two': 'Bearer test-two' };

// Load real route code with explicit dependencies: no next-auth, Gemini, or hosted KV.
async function routeHarness(kv) {
  const dependencies = {
    '@vercel/kv': { kv },
    auth: {
      requireAuth: async (req, res) => {
        const users = Object.fromEntries(Object.entries(BEARER).map(([user, header]) => [header, user]));
        const user = users[req.headers?.authorization];
        if (!user) res.status(401).json({ error: 'Authentication required' });
        return user || null;
      },
      getUserName: async () => 'Test User',
    },
    'task-store.mjs': taskStore,
    'triage-stats.mjs': triageStats,
    'capture-board.mjs': captureBoard,
    constants,
    extract: { getKnownPeople: async () => [], todayInTimeZone: () => '2026-09-08' },
  };
  async function load(relativePath) {
    const context = createContext({ process: { env: {} }, console: { log() {}, error() {} } });
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
  const handlers = {
    inbox: await load('../pages/api/capture/inbox.js'),
    board: await load('../pages/api/capture/board.js'),
    context: await load('../pages/api/capture/context.js'),
    taskById: await load('../pages/api/tasks/[id].js'),
  };
  const call = async (handler, req, user = 'user-one') => {
    const res = response();
    await handler({ headers: user ? { authorization: BEARER[user] } : {}, query: {}, body: {}, ...req }, res);
    // Route bodies are built inside the vm context; serialize like the wire does so deepEqual compares plain values.
    if (res.body !== undefined) res.body = JSON.parse(JSON.stringify(res.body));
    return res;
  };
  return {
    inbox: (query = {}, user) => call(handlers.inbox, { method: 'GET', query }, user),
    board: (query = {}, user) => call(handlers.board, { method: 'GET', query }, user),
    context: (query = {}, user) => call(handlers.context, { method: 'GET', query }, user),
    patch: (id, body, user) => call(handlers.taskById, { method: 'PATCH', query: { id }, body }, user),
    remove: (id, body, user) => call(handlers.taskById, { method: 'DELETE', query: { id }, body }, user),
    raw: (name, req, user) => call(handlers[name], req, user),
  };
}

const NOW = new Date('2026-09-08T18:00:00Z');
const TASK_FIELDS = ['id', 'task', 'status', 'archived', 'owner', 'dueDate', 'priority', 'type', 'person', 'meetingId', 'meetingTitle', 'createdAt', 'tags'];
const clear = (timestamp, newValue = 'todo', extra = {}) =>
  ({ id: `act_${timestamp}`, type: 'update', field: 'status', oldValue: 'uncategorized', newValue, user: 'Test User', timestamp, ...extra });
const task = (id, overrides = {}) => ({ id, userId: 'user-one', task: `Task ${id}`, status: 'uncategorized', activity: [], tags: ['watch'], ...overrides });

function seededKV() {
  return new MemoryKV()
    .seed('meetings', [
      { id: 'm1', userId: 'user-one', title: 'Quick captures — Sep 7, 2026' },
      { id: 'm-legacy', title: 'Legacy meeting without userId' },
      { id: 'm-other', userId: 'user-two', title: 'Someone else' },
    ])
    .seed('columns', [
      { id: 'blocked', label: 'Blocked', custom: true, userId: 'user-one' },
      { id: 'theirs', label: 'Theirs', custom: true, userId: 'user-two' },
      { id: 'todo', label: 'Not custom', custom: false, userId: 'user-one' },
    ])
    .seed('tasks', [
      task('newest', { createdAt: '2026-09-08T12:00:00Z', meetingId: 'm1', owner: 'Me', dueDate: '2026-09-10', priority: 'high', type: 'follow-up', person: 'Sam' }),
      task('no-date', { createdAt: undefined, meetingId: 'm-legacy' }),
      task('oldest', { createdAt: '2026-09-01T12:00:00Z', meetingId: 'm1' }),
      task('bad-date', { createdAt: 'garbage', meetingId: 'm-missing' }),
      task('middle', { createdAt: '2026-09-05T12:00:00Z', meetingId: 'm-other' }),
      task('done', { status: 'done', createdAt: '2026-09-01T00:00:00Z', dueDate: '2026-09-02' }),
      task('todo-soon', { status: 'todo', createdAt: '2026-09-07T00:00:00Z', dueDate: '2026-09-09' }),
      task('todo-later', { status: 'todo', createdAt: '2026-09-02T00:00:00Z', dueDate: '2026-09-10' }),
      task('trashed', { deleted: true, createdAt: '2026-09-01T00:00:00Z' }),
      task('archived', { status: 'done', archived: true, createdAt: '2026-09-01T00:00:00Z' }),
      task('theirs', { userId: 'user-two', createdAt: '2026-09-01T00:00:00Z' }),
    ]);
}

describe('computeTriageStats', () => {
  test('counts inbox clears per local day and totals them', () => {
    const tasks = [
      task('a', { status: 'todo', activity: [clear('2026-09-08T10:00:00Z')] }),
      task('b', { status: 'done', activity: [clear('2026-09-08T11:00:00Z', 'done'), clear('2026-09-06T09:00:00Z', 'waiting')] }),
      task('c', { userId: 'user-two', status: 'todo', activity: [clear('2026-09-08T10:00:00Z')] }),   // not ours
    ];
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW }), {
      clearedByDay: { '2026-09-08': 2, '2026-09-06': 1 },
      cleared30Days: 3,
    });
  });

  test('window boundary: (now - days, now] inclusive of now, exclusive of the far edge; future events excluded', () => {
    const edge = NOW.getTime() - 30 * 24 * 60 * 60 * 1000;
    const tasks = [task('a', { status: 'todo', activity: [
      clear(new Date(edge - 1).toISOString()),          // just outside
      clear(new Date(edge).toISOString()),              // exactly 30 days ago: outside
      clear(new Date(edge + 1).toISOString()),          // just inside
      clear(NOW.toISOString()),                         // now: inside
      clear(new Date(NOW.getTime() + 1).toISOString()), // future: outside
    ] })];
    const stats = computeTriageStats(tasks, 'user-one', { now: NOW });
    assert.equal(stats.cleared30Days, 2);
    assert.deepEqual(Object.keys(stats.clearedByDay).sort(), ['2026-08-09', '2026-09-08']);
    assert.equal(computeTriageStats(tasks, 'user-one', { now: NOW, days: 7 }).cleared30Days, 1);
  });

  test('buckets by the requested time zone, splitting events across local midnight', () => {
    // 2026-09-08T03:30Z is still Sep 7 in Chicago (22:30 CDT) but Sep 8 in UTC and Tokyo (12:30 JST).
    const tasks = [task('a', { status: 'todo', activity: [clear('2026-09-08T03:30:00Z'), clear('2026-09-08T12:00:00Z', 'done')] })];
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW, tz: 'America/Chicago' }).clearedByDay, { '2026-09-07': 1, '2026-09-08': 1 });
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW, tz: 'UTC' }).clearedByDay, { '2026-09-08': 2 });
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW, tz: 'Asia/Tokyo' }).clearedByDay, { '2026-09-08': 2 });
  });

  test('ignores non-status updates, moves that did not start in the inbox, comments and bad timestamps', () => {
    const tasks = [task('a', { status: 'done', activity: [
      { id: '1', type: 'update', field: 'priority', oldValue: 'low', newValue: 'high', user: 'U', timestamp: '2026-09-08T10:00:00Z' },
      { id: '2', type: 'update', field: 'status', oldValue: 'todo', newValue: 'done', user: 'U', timestamp: '2026-09-08T10:00:00Z' },
      { id: '3', type: 'update', field: 'status', oldValue: 'uncategorized', newValue: 'uncategorized', user: 'U', timestamp: '2026-09-08T10:00:00Z' },
      { id: '4', type: 'comment', field: null, oldValue: null, newValue: 'uncategorized', user: 'U', timestamp: '2026-09-08T10:00:00Z' },
      clear('not a date'),
      clear(undefined),
      clear(null),
      clear('2026-09-08T10:00:00Z'),
    ] }), task('b', { activity: null }), null];
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW }), { clearedByDay: { '2026-09-08': 1 }, cleared30Days: 1 });
  });

  test('deleted and archived tasks still count; empty input is safe', () => {
    const tasks = [
      task('a', { status: 'todo', deleted: true, deletedAt: NOW.toISOString(), activity: [clear('2026-09-08T10:00:00Z')] }),
      task('b', { status: 'done', archived: true, activity: [clear('2026-09-07T10:00:00Z', 'done')] }),
    ];
    assert.equal(computeTriageStats(tasks, 'user-one', { now: NOW }).cleared30Days, 2);
    assert.deepEqual(computeTriageStats([], 'user-one', { now: NOW }), { clearedByDay: {}, cleared30Days: 0 });
    assert.deepEqual(computeTriageStats(null, 'user-one', { now: NOW }), { clearedByDay: {}, cleared30Days: 0 });
  });

  test('an invalid time zone falls back to UTC', () => {
    const tasks = [task('a', { status: 'todo', activity: [clear('2026-09-08T03:30:00Z')] })];
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW, tz: 'Not/AZone' }).clearedByDay, { '2026-09-08': 1 });
    assert.deepEqual(computeTriageStats(tasks, 'user-one', { now: NOW, tz: '' }).clearedByDay, { '2026-09-08': 1 });
  });
});

describe('GET /api/capture/inbox', () => {
  test('requires auth and never touches storage without it', async () => {
    const kv = seededKV(), routes = await routeHarness(kv);
    const res = await routes.inbox({}, null);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Authentication required' });
    assert.equal(kv.reads, 0);
    assert.equal((await routes.inbox({}, 'user-two')).body.inboxCount, 1);
  });

  test('returns the user\'s open inbox oldest first with meeting titles joined, and no-store caching', async () => {
    const routes = await routeHarness(seededKV());
    const res = await routes.inbox({ tz: 'America/Chicago' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(Object.keys(res.body).sort(), ['inboxCount', 'tasks', 'triage']);
    assert.equal(res.body.inboxCount, 5);
    assert.deepEqual(res.body.tasks.map(t => t.id), ['oldest', 'middle', 'newest', 'no-date', 'bad-date']);
    assert.deepEqual(res.body.tasks[2], {
      id: 'newest', task: 'Task newest', status: 'uncategorized', archived: false, owner: 'Me', dueDate: '2026-09-10', priority: 'high',
      type: 'follow-up', person: 'Sam', meetingId: 'm1', meetingTitle: 'Quick captures — Sep 7, 2026', createdAt: '2026-09-08T12:00:00Z', tags: ['watch'],
    });
    for (const t of res.body.tasks) {
      assert.deepEqual(Object.keys(t), TASK_FIELDS);
      assert.equal(t.status, 'uncategorized');
      assert.equal(t.archived, false);
    }
    assert.equal(res.body.tasks[1].meetingTitle, null, 'another user\'s meeting title is not joined');
    assert.equal(res.body.tasks[3].meetingTitle, 'Legacy meeting without userId');
    assert.equal(res.body.tasks[3].createdAt, null);
    assert.equal(res.body.tasks[4].meetingTitle, null, 'unknown meeting id');
    assert.equal(res.body.tasks[4].owner, null);
    assert.deepEqual(res.body.triage, { clearedByDay: {}, cleared30Days: 0 });
  });

  test('limit truncates the list but not inboxCount; defaults to 50 and caps at 200', async () => {
    const routes = await routeHarness(seededKV());
    const two = await routes.inbox({ limit: '2' });
    assert.deepEqual(two.body.tasks.map(t => t.id), ['oldest', 'middle']);
    assert.equal(two.body.inboxCount, 5);
    for (const limit of ['0', '-3', 'abc', undefined]) assert.equal((await routes.inbox({ limit })).body.tasks.length, 5);

    const kv = new MemoryKV().seed('tasks', Array.from({ length: 260 }, (_, i) => task(`t${i}`, { createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() })));
    const routesBig = await routeHarness(kv);
    const big = await routesBig.inbox({ limit: '1000' });
    assert.equal(big.body.tasks.length, 200);
    assert.equal(big.body.inboxCount, 260);
    assert.equal(big.body.tasks[0].id, 't0');
    assert.equal((await routesBig.inbox({})).body.tasks.length, 50);
    assert.equal((await routesBig.inbox({ limit: ['3', '9'] })).body.tasks.length, 3);
  });

  test('empty storage yields an empty inbox rather than an error; non-GET is 405', async () => {
    const routes = await routeHarness(new MemoryKV());
    const res = await routes.inbox();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { tasks: [], inboxCount: 0, triage: { clearedByDay: {}, cleared30Days: 0 } });
    assert.equal((await routes.raw('inbox', { method: 'POST' })).statusCode, 405);
  });
});

describe('GET /api/capture/board', () => {
  test('requires auth and rejects non-GET', async () => {
    const kv = seededKV(), routes = await routeHarness(kv);
    assert.equal((await routes.board({}, null)).statusCode, 401);
    assert.equal(kv.reads, 0);
    assert.equal((await routes.raw('board', { method: 'POST' })).statusCode, 405);
  });

  test('returns every live task across statuses, due date first then createdAt, with columns and triage', async () => {
    const routes = await routeHarness(seededKV());
    const res = await routes.board({ tz: 'America/Chicago' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(Object.keys(res.body).sort(), ['columns', 'inboxCount', 'tasks', 'triage']);
    // dated tasks ascending (todo-soon/todo-later/newest share or follow 'done'), then undated by createdAt with missing last
    assert.deepEqual(res.body.tasks.map(t => t.id), ['done', 'todo-soon', 'todo-later', 'newest', 'oldest', 'middle', 'no-date', 'bad-date']);
    assert.equal(res.body.inboxCount, 5);
    for (const t of res.body.tasks) {
      assert.deepEqual(Object.keys(t), TASK_FIELDS);
      assert.equal(t.archived, false);
    }
    assert.equal(res.body.tasks[0].status, 'done');
    assert.equal(res.body.tasks[1].status, 'todo');
    assert.equal(res.body.tasks[4].status, 'uncategorized');
    assert.equal(res.body.tasks[4].meetingTitle, 'Quick captures — Sep 7, 2026');
    assert.ok(!res.body.tasks.some(t => ['trashed', 'archived', 'theirs'].includes(t.id)));
    assert.deepEqual(res.body.columns, [
      ...constants.DEFAULT_COLUMNS.map(c => ({ id: c.id, label: c.label })),
      { id: 'blocked', label: 'Blocked' },
    ]);
    assert.deepEqual(res.body.triage, { clearedByDay: {}, cleared30Days: 0 });
  });

  test('same-day due dates fall back to createdAt order; limit defaults to 300 and caps at 1000', async () => {
    const routes = await routeHarness(seededKV());
    const res = await routes.board();
    // todo-later (due 09-10, created 09-02) precedes newest (due 09-10, created 09-08)
    assert.deepEqual(res.body.tasks.slice(2, 4).map(t => t.id), ['todo-later', 'newest']);
    assert.deepEqual((await routes.board({ limit: '1' })).body.tasks.map(t => t.id), ['done']);
    assert.equal((await routes.board({ limit: '1' })).body.inboxCount, 5, 'inboxCount is not truncated');

    const kv = new MemoryKV().seed('tasks', Array.from({ length: 1200 }, (_, i) => task(`t${i}`, { status: i % 2 ? 'todo' : 'uncategorized', createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() })));
    const big = await routeHarness(kv);
    assert.equal((await big.board()).body.tasks.length, 300);
    assert.equal((await big.board({ limit: '5000' })).body.tasks.length, 1000);
    assert.equal((await big.board({ limit: 'abc' })).body.tasks.length, 300);
    assert.equal((await big.board()).body.inboxCount, 600);
    assert.equal((await big.board()).body.tasks[0].id, 't0');
  });

  test('empty storage yields an empty board with the default columns', async () => {
    const routes = await routeHarness(new MemoryKV());
    const res = await routes.board();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.tasks, []);
    assert.equal(res.body.inboxCount, 0);
    assert.deepEqual(res.body.columns, constants.DEFAULT_COLUMNS.map(c => ({ id: c.id, label: c.label })));
  });
});

describe('GET /api/capture/context', () => {
  test('includes triage stats alongside the existing fields', async () => {
    const kv = new MemoryKV().seed('columns', []).seed('tasks', [
      task('a', { status: 'todo', tags: ['watch', 'client'], activity: [clear('2026-09-08T03:30:00Z')] }),
      task('b'),
    ]);
    const routes = await routeHarness(kv);
    const res = await routes.context({ tz: 'America/Chicago' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body), ['today', 'people', 'columns', 'tags', 'inboxCount', 'triage']);
    assert.equal(res.body.inboxCount, 1);
    assert.equal(res.headers['Cache-Control'], 'private, max-age=300');
    assert.ok(res.body.tags.includes('watch'));
    assert.deepEqual(res.body.columns[0], { id: 'uncategorized', label: 'Uncategorized' });
    assert.equal(res.body.triage.cleared30Days, 1);
    assert.deepEqual(res.body.triage.clearedByDay, { '2026-09-07': 1 });   // 22:30 CDT the evening before
    assert.deepEqual((await routes.context({ tz: 'UTC' })).body.triage.clearedByDay, { '2026-09-08': 1 });
    assert.equal((await routes.context({}, null)).statusCode, 401);
  });
});

describe('Triage actions through /api/tasks/[id] with a bearer token', () => {
  test('PATCH status (+ type) moves the task, logs the clear, and the clear shows up in stats, inbox and board', async () => {
    const kv = new MemoryKV().seed('meetings', []).seed('tasks', [task('a', { createdAt: '2026-09-08T10:00:00Z' }), task('b', { createdAt: '2026-09-08T11:00:00Z' })]);
    const routes = await routeHarness(kv);
    assert.equal((await routes.inbox()).body.inboxCount, 2);

    const before = Date.now();
    const res = await routes.patch('a', { status: 'todo', type: 'follow-up' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.task.id, 'a');
    assert.equal(res.body.task.status, 'todo');
    assert.equal(res.body.task.type, 'follow-up');
    assert.deepEqual(Object.keys(res.body).sort(), ['success', 'task']);

    const stored = (await kv.get('tasks')).find(t => t.id === 'a');
    const statusEntry = stored.activity.find(e => e.field === 'status');
    assert.ok(statusEntry, 'a status activity entry is written');
    assert.equal(statusEntry.type, 'update');
    assert.equal(statusEntry.oldValue, 'uncategorized');
    assert.equal(statusEntry.newValue, 'todo');
    assert.equal(statusEntry.user, 'Test User');
    assert.ok(Date.parse(statusEntry.timestamp) >= before - 1000);
    assert.equal(stored.activity.filter(e => e.field === 'type').length, 1);
    assert.equal(kv.writes, 1);

    for (const status of ['waiting', 'done']) {
      assert.equal((await routes.patch('b', { status })).body.task.status, status);
    }
    const stats = computeTriageStats(await kv.get('tasks'), 'user-one');
    assert.equal(stats.cleared30Days, 2, 'b: uncategorized→waiting counts, waiting→done does not');

    const inbox = await routes.inbox();
    assert.equal(inbox.body.inboxCount, 0);
    assert.deepEqual(inbox.body.tasks, []);
    assert.equal(inbox.body.triage.cleared30Days, 2);
    assert.equal(Object.values(inbox.body.triage.clearedByDay).reduce((a, b) => a + b, 0), 2);
    assert.equal((await routes.context()).body.triage.cleared30Days, 2);
    const board = await routes.board();
    assert.deepEqual(board.body.tasks.map(t => [t.id, t.status]), [['a', 'todo'], ['b', 'done']]);
    assert.equal(board.body.inboxCount, 0);
    assert.equal(board.body.triage.cleared30Days, 2);
  });

  test('re-sending the same status writes no duplicate clear', async () => {
    const kv = new MemoryKV().seed('tasks', [task('a')]);
    const routes = await routeHarness(kv);
    await routes.patch('a', { status: 'todo' });
    await routes.patch('a', { status: 'todo' });
    const stored = (await kv.get('tasks')).find(t => t.id === 'a');
    assert.equal(stored.activity.filter(e => e.field === 'status').length, 1);
    assert.equal(computeTriageStats(await kv.get('tasks'), 'user-one').cleared30Days, 1);
  });

  test('DELETE { permanent: false } soft-deletes and removes the task from the inbox and board', async () => {
    const kv = new MemoryKV().seed('meetings', []).seed('tasks', [task('a', { createdAt: '2026-09-08T10:00:00Z' })]);
    const routes = await routeHarness(kv);
    const res = await routes.remove('a', { permanent: false });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.task.deleted, true);
    assert.ok(Date.parse(res.body.task.deletedAt) > 0);
    const stored = await kv.get('tasks');
    assert.equal(stored.length, 1, 'soft delete keeps the record');
    assert.equal(stored[0].deleted, true);
    assert.equal((await routes.inbox()).body.inboxCount, 0);
    assert.deepEqual((await routes.board()).body.tasks, []);
    assert.equal((await routes.remove('a', undefined)).statusCode, 200, 'a missing body is tolerated');
  });

  test('another user cannot triage or delete the task', async () => {
    const kv = new MemoryKV().seed('tasks', [task('a')]);
    const routes = await routeHarness(kv);
    assert.equal((await routes.patch('a', { status: 'todo' }, 'user-two')).statusCode, 404);
    assert.equal((await routes.remove('a', { permanent: false }, 'user-two')).statusCode, 404);
    assert.equal((await routes.patch('a', { status: 'todo' }, null)).statusCode, 401);
    assert.equal(kv.writes, 0);
  });
});

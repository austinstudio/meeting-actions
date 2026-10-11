// PRD-14 Relationships backfill: historical touches from meetings, the email archive, transcripts and done
// tasks for a person who joined the roster (lib/relationships-backfill.mjs), the add route's inline call and
// POST /api/relationships/<contactId>/backfill. Run with: npm test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as taskStore from '../lib/task-store.mjs';
import * as S from '../lib/relationships-store.mjs';
import * as relationshipsRoutes from '../lib/relationships-routes.mjs';
import * as B from '../lib/relationships-backfill.mjs';
import { CAS_SCRIPT } from '../lib/cas.mjs';

const USER = 'user-one';
const NOW = new Date('2026-09-20T12:00:00Z');
const daysAgo = n => new Date(NOW.getTime() - n * 86400000).toISOString();

// In-memory @vercel/kv with JSON values, MGET, the shared CAS Lua, sorted sets (ZRANGE honours { rev }), a log.
class FakeKV {
  values = new Map(); zsets = new Map(); log = [];
  #cmd(name) { this.log.push(name); }
  seed(key, value) { this.values.set(key, JSON.stringify(value)); return this; }
  async get(k) { this.#cmd('get'); return this.values.has(k) ? JSON.parse(this.values.get(k)) : null; }
  async mget(...keys) { this.#cmd('mget'); return keys.map(k => (this.values.has(k) ? JSON.parse(this.values.get(k)) : null)); }
  async set(k, v) { this.#cmd('set'); this.values.set(k, JSON.stringify(v)); }
  async del(k) { this.#cmd('del'); this.values.delete(k); this.zsets.delete(k); }
  async eval(script, keys, args) {
    this.#cmd('eval');
    assert.ok(script === CAS_SCRIPT || script === taskStore.TASKS_CAS_SCRIPT, 'only the CAS script is expected');
    const [key, versionKey] = keys, [json, expected] = args;
    const current = this.values.has(versionKey) ? String(JSON.parse(this.values.get(versionKey))) : '0';
    if (current !== expected) return 0;
    this.values.set(key, json);
    this.values.set(versionKey, String(Number(current) + 1));
    return 1;
  }
  #z(k) { if (!this.zsets.has(k)) this.zsets.set(k, new Map()); return this.zsets.get(k); }
  #sorted(k) { return [...(this.zsets.get(k) || new Map())].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([m]) => m); }
  async zadd(k, ...pairs) { this.#cmd('zadd'); const z = this.#z(k); let n = 0; for (const { score, member } of pairs) { if (!z.has(member)) n++; z.set(member, score); } return n; }
  async zrange(k, start, stop, opts = {}) {
    this.#cmd('zrange');
    let all = this.#sorted(k);
    if (opts.rev) all = all.reverse();
    return all.slice(start, stop === -1 ? undefined : stop + 1);
  }
  async zrem(k, ...members) { this.#cmd('zrem'); const z = this.#z(k); let n = 0; for (const m of members) if (z.delete(m)) n++; return n; }
  async zcard(k) { this.#cmd('zcard'); return this.zsets.get(k)?.size ?? 0; }
  async zremrangebyrank(k, start, stop) {
    this.#cmd('zremrangebyrank');
    const all = this.#sorted(k);
    const from = start < 0 ? Math.max(0, all.length + start) : start;
    const to = stop < 0 ? all.length + stop + 1 : stop + 1;
    const doomed = to > from ? all.slice(from, to) : [];
    const z = this.#z(k); doomed.forEach(m => z.delete(m)); return doomed.length;
  }
  person(contactId) { const raw = this.values.get(S.personKey(USER, contactId)); return raw ? JSON.parse(raw) : null; }
}

const contact = (id, name, extra = {}) => ({ id, userId: USER, name, aliases: [], role: 'Lead', company: 'Ascend', relationshipContext: '', deleted: false, email: '', ...extra });
const CONTACTS = [
  contact('c_dan', 'Dan Okafor', { email: 'Dan@Northwind.com', company: 'Northwind' }),
  contact('c_ayan', 'Ayan Pal', { aliases: ['Ayen'] }),          // no email on file → name matching
  contact('c_dan2', 'Dan Brown'),                                 // makes the bare first name "Dan" ambiguous
  contact('c_priya', 'Priya Raman'),
];
const meeting = (id, overrides = {}) => ({ id, userId: USER, title: `Meeting ${id}`, summary: '', participants: [], date: daysAgo(10), ...overrides });
const task = (id, overrides = {}) => ({ id, userId: USER, task: `Task ${id}`, status: 'todo', createdAt: daysAgo(30), ...overrides });
const email = (id, overrides = {}) => ({ outlook_id: id, subject: `Subject ${id}`, sender_email: 'someone@else.com', sender_name: 'Someone Else', to: [], cc: [], sent_at: daysAgo(5), ...overrides });

function seedEmails(kv, emails) {
  for (const e of emails) {
    kv.seed(`email:${e.outlook_id}`, e);
    kv.zadd('emails:by_date', { score: Date.parse(e.sent_at), member: e.outlook_id });
  }
}

async function seeded() {
  const kv = new FakeKV().seed('contacts', CONTACTS).seed('tasks', []).seed('meetings', []);
  await S.addToRoster(kv, USER, { contactId: 'c_dan', list: 'guests' });
  await S.addToRoster(kv, USER, { contactId: 'c_ayan', list: 'crew' });
  kv.log.length = 0;
  return kv;
}

describe('backfill sources', () => {
  test('meetings by participant and by title mention, within 730 days; nothing else', async () => {
    const kv = await seeded();
    kv.seed('meetings', [
      meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(20), title: 'Q3 roadmap' }),
      meeting('m_first', { participants: ['dan'], date: daysAgo(15) }),                        // bare first name resolves against the single contact
      meeting('m_title', { title: 'Dan Okafor sync: Dan on pricing', date: daysAgo(3) }),        // named twice
      meeting('m_once', { title: 'Dan mentioned once', date: daysAgo(2) }),                      // one mention → no
      meeting('m_old', { participants: ['Dan Okafor'], date: daysAgo(800) }),                    // too old
      meeting('m_theirs', { participants: ['Dan Okafor'], userId: 'user-two' }),                 // not mine
    ]);
    const r = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.equal(r.touchesAdded, 3);
    assert.deepEqual(r.bySource, { meeting: 3, mail: 0, transcript: 0, task: 0 });
    const p = kv.person('c_dan');
    assert.deepEqual(p.touches.map(t => t.sourceRef), ['meeting:m_title', 'meeting:m_first', 'meeting:m_att'], 'newest first');
    assert.equal(p.touches[0].channel, 'meeting'); assert.equal(p.touches[0].confidence, 'high'); assert.equal(p.touches[0].about, 'Dan Okafor sync: Dan on pricing');
    assert.equal(p.rollup.lastTouchAt, daysAgo(3), 'the rollup follows the newest backfilled touch');
    assert.equal(r.partial, false);
  });

  test('emails match by address (any case, angle-bracketed, in to/cc) and only by name when no address is on file', async () => {
    const kv = await seeded();
    seedEmails(kv, [
      email('e1', { sender_email: 'dan@northwind.com', sent_at: daysAgo(9) }),
      email('e2', { to: ['Somebody <DAN@northwind.com>'], sent_at: daysAgo(8) }),
      email('e3', { cc: ['x@y.com', 'dan@northwind.com'], sent_at: daysAgo(7) }),
      email('e4', { sender_name: 'Dan Okafor', sender_email: 'dan.personal@gmail.com', sent_at: daysAgo(6) }),  // name only; Dan has an address → not matched
      email('e5', { sender_name: 'Ayan Pal', sender_email: 'ayan@ascend.com', sent_at: daysAgo(4) }),           // Ayan has no address → name match
      email('e6', { sender_name: 'Ayen', sender_email: 'a@ascend.com', sent_at: daysAgo(3) }),                   // alias
      email('e7', { sender_name: 'Dan', sender_email: 'd@x.com', sent_at: daysAgo(2) }),                          // ambiguous first name → nobody
      email('e8', { sender_email: 'nobody@nowhere.com', sent_at: daysAgo(1) }),
    ]);
    const dan = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.deepEqual(dan.bySource, { meeting: 0, mail: 3, transcript: 0, task: 0 });
    const danRefs = kv.person('c_dan').touches.map(t => t.sourceRef);
    assert.deepEqual(danRefs, ['email:e3', 'email:e2', 'email:e1']);
    assert.ok(kv.person('c_dan').touches.every(t => t.channel === 'mail' && t.direction === 'in' && t.source === 'mail'));
    assert.equal(kv.person('c_dan').touches[0].about, 'Subject e3');
    const ayan = await B.backfillPerson(kv, USER, 'c_ayan', { now: NOW });
    assert.deepEqual(kv.person('c_ayan').touches.map(t => t.sourceRef), ['email:e6', 'email:e5']);
    assert.equal(ayan.touchesAdded, 2);
  });

  test('a rescan adds nothing new and a later live signal for the same meeting is a duplicate', async () => {
    const kv = await seeded();
    kv.seed('meetings', [meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(20) })]);
    seedEmails(kv, [email('e1', { sender_email: 'dan@northwind.com', sent_at: daysAgo(9) })]);
    const first = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.equal(first.touchesAdded, 2);
    const again = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.equal(again.touchesAdded, 0);
    assert.equal(kv.person('c_dan').touches.length, 2);
    const live = await S.recordMeetingSignals(kv, meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(20) }));
    assert.equal(live[0].outcome, 'skipped'); assert.equal(live[0].reason, 'duplicate');
    assert.equal(kv.person('c_dan').touches.length, 2);
  });

  test('a recent email survives the seen cap: 501 older meetings plus one email, and a second scan adds nothing', async () => {
    const kv = await seeded();
    // Meetings are collected before emails, so with > 500 refs the email's ref used to be the one trimmed off `seen`.
    kv.seed('meetings', Array.from({ length: 501 }, (_, i) => meeting(`m${i}`, { participants: ['Dan Okafor'], date: daysAgo(10 + i) })));
    seedEmails(kv, [email('e_recent', { sender_email: 'dan@northwind.com', sent_at: daysAgo(1) })]);
    const first = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.equal(first.touchesAdded, S.TOUCH_CAP, '502 candidates, but only the 200 that survive the cap count as added');
    assert.deepEqual(first.bySource, { meeting: 199, mail: 1, transcript: 0, task: 0 });
    let p = kv.person('c_dan');
    assert.equal(p.touches.length, S.TOUCH_CAP);
    assert.equal(p.touches[0].sourceRef, 'email:e_recent', 'the email is the newest retained touch');
    assert.equal(p.seen.length, S.SEEN_CAP);
    assert.ok(p.seen.includes('email:e_recent'), 'a retained touch keeps its ref in seen');
    assert.ok(p.touches.every(t => p.seen.includes(t.sourceRef)), 'every retained touch is covered by seen');
    const again = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.equal(again.touchesAdded, 0, 'an immediate rescan inserts nothing');
    assert.deepEqual(again.bySource, { meeting: 0, mail: 0, transcript: 0, task: 0 });
    p = kv.person('c_dan');
    assert.equal(p.touches.length, S.TOUCH_CAP);
    assert.equal(p.touches.filter(t => t.sourceRef === 'email:e_recent').length, 1, 'the email is still a single touch');
  });

  test('transcripts: only unmatched meetings within 90 days, newest first, at most 40 reads, named twice', async () => {
    const kv = await seeded();
    const meetings = [
      meeting('m_hit', { date: daysAgo(10) }),
      meeting('m_miss', { date: daysAgo(11) }),
      meeting('m_old', { date: daysAgo(100) }),                                        // outside the window
      meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(12) }),           // matched in step 1 → no transcript read
      ...Array.from({ length: 45 }, (_, i) => meeting(`m_fill${i}`, { date: daysAgo(13 + i) })),
    ];
    kv.seed('meetings', meetings);
    kv.seed('meeting:m_hit:transcript', { text: 'Dan said the SOW is late. Dan Okafor agreed to a call.' });
    kv.seed('meeting:m_miss:transcript', { text: 'Dan was mentioned once.' });
    kv.seed('meeting:m_old:transcript', { text: 'Dan and Dan again' });
    kv.seed('meeting:m_att:transcript', { text: 'Dan and Dan again' });
    const before = kv.log.length;
    const r = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    // 48 candidate transcripts exist; the GETs are contacts, tasks, meetings, roster, the person + version (≤ 6) plus at most 40 transcripts.
    const gets = kv.log.slice(before).filter(c => c === 'get').length;
    assert.ok(gets >= B.TRANSCRIPT_READ_CAP && gets <= B.TRANSCRIPT_READ_CAP + 6, `transcript reads capped (${gets} GETs)`);
    assert.deepEqual(r.bySource, { meeting: 1, mail: 0, transcript: 1, task: 0 });
    const refs = kv.person('c_dan').touches.map(t => t.sourceRef);
    assert.ok(refs.includes('meeting:m_hit') && refs.includes('meeting:m_att'));
    assert.ok(!refs.includes('meeting:m_miss') && !refs.includes('meeting:m_old'));
  });

  test('done tasks for or from the person become inferred work touches dated by the done activity', async () => {
    const kv = await seeded();
    kv.seed('tasks', [
      task('t1', { owner: 'Dan Okafor', status: 'done', updatedAt: daysAgo(6), activity: [{ field: 'status', newValue: 'done', timestamp: daysAgo(8) }] }),
      task('t2', { owner: 'Me', person: 'Dan Okafor', status: 'done', updatedAt: daysAgo(4) }),
      task('t3', { owner: 'Me', person: 'Dan Okafor', status: 'todo' }),                          // open → not a touch
      task('t4', { owner: 'Dan Okafor', status: 'done', deleted: true, updatedAt: daysAgo(2) }),  // trashed
      task('t5', { owner: 'Priya Raman', status: 'done', updatedAt: daysAgo(1) }),                // someone else
    ]);
    const r = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.deepEqual(r.bySource, { meeting: 0, mail: 0, transcript: 0, task: 2 });
    const touches = kv.person('c_dan').touches;
    assert.deepEqual(touches.map(t => [t.sourceRef, t.at]), [['task-done:t2', daysAgo(4)], ['task-done:t1', daysAgo(8)]]);
    assert.ok(touches.every(t => t.channel === 'work' && t.inferred === true && t.confidence === 'medium'));
    const rollup = kv.person('c_dan').rollup;
    assert.equal(rollup.lastTouchInferred, true); assert.equal(rollup.lastFirmTouchAt, null);
    // the live task-done hook uses the same sourceRef → no double touch
    const live = await S.recordTaskDone(kv, { ...task('t2', { owner: 'Me', person: 'Dan Okafor', status: 'done', updatedAt: daysAgo(4) }) });
    assert.equal(live[0].reason, 'duplicate');
  });

  test('the command budget stops the pass and reports partial; the deadline does too', async () => {
    const kv = await seeded();
    kv.seed('meetings', Array.from({ length: 30 }, (_, i) => meeting(`m${i}`, { date: daysAgo(1 + i) })));
    for (let i = 0; i < 30; i++) kv.seed(`meeting:m${i}:transcript`, { text: 'Dan Okafor and Dan Okafor' });
    const tight = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW, commandBudget: 8 });
    assert.equal(tight.partial, true);
    assert.ok(tight.commands <= 9, `stopped at the budget (${tight.commands})`);
    const slow = await B.backfillPerson(new FakeKV().seed('contacts', CONTACTS).seed('tasks', []).seed('meetings', []), USER, 'c_dan', { now: NOW, deadlineMs: -1 }).catch(e => e);
    assert.ok(slow instanceof S.RelationshipsError && slow.status === 404, 'off-roster is a 404 even when out of time');
    const kv2 = await seeded();
    kv2.seed('meetings', [meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(20) })]);
    const timed = await B.backfillPerson(kv2, USER, 'c_dan', { now: NOW, deadlineMs: -1 });
    assert.equal(timed.partial, true, 'past the deadline → partial');
    assert.equal(timed.bySource.meeting, 1, 'the meetings pass (no extra reads) still wrote what it found');
  });

  test('a typical rescan costs a few dozen commands', async () => {
    const kv = await seeded();
    kv.seed('meetings', [meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(20) }), meeting('m_recent', { date: daysAgo(5) })]);
    kv.seed('meeting:m_recent:transcript', { text: 'nothing about anyone' });
    seedEmails(kv, Array.from({ length: 450 }, (_, i) => email(`e${i}`, { sender_email: i % 50 === 0 ? 'dan@northwind.com' : 'x@y.com', sent_at: daysAgo(1 + i / 10) })));
    kv.seed('tasks', [task('t1', { owner: 'Dan Okafor', status: 'done', updatedAt: daysAgo(6) })]);
    const r = await B.backfillPerson(kv, USER, 'c_dan', { now: NOW });
    assert.deepEqual(r.bySource, { meeting: 1, mail: 9, transcript: 0, task: 1 });
    assert.ok(r.commands <= 20, `commands: ${r.commands}`);   // 4 reads + zrange + 3 mget + 1 transcript + CAS (2 reads + eval)
    console.log(`backfill typical commands: ${r.commands}`);
  });

  test('helpers: addressOf, emailMatches, doneAt', () => {
    assert.equal(B.addressOf('Dan Okafor <Dan@Northwind.com>'), 'dan@northwind.com');
    assert.equal(B.addressOf(' dan@northwind.com '), 'dan@northwind.com');
    assert.equal(B.emailMatches(email('x', { sender_email: 'dan@northwind.com' }), CONTACTS[0], CONTACTS), 'address');
    assert.equal(B.emailMatches(email('x', { sender_name: 'Dan Okafor' }), CONTACTS[0], CONTACTS), null, 'name is not enough when an address is on file');
    assert.equal(B.emailMatches(email('x', { sender_name: 'Ayen' }), CONTACTS[1], CONTACTS), 'name');
    assert.equal(B.emailMatches(null, CONTACTS[0], CONTACTS), null);
    assert.equal(B.doneAt({ activity: [{ field: 'status', newValue: 'done', timestamp: '2026-09-01T00:00:00Z' }, { field: 'status', newValue: 'done', timestamp: '2026-09-05T00:00:00Z' }], updatedAt: '2026-09-09T00:00:00Z' }), '2026-09-05T00:00:00Z');
    assert.equal(B.doneAt({ updatedAt: '2026-09-09T00:00:00Z' }), '2026-09-09T00:00:00Z');
    assert.equal(B.doneAt({ createdAt: 'nope' }), null);
  });
});

// Routes through the real handlers

const BEARER = { 'user-one': 'Bearer test-one' };

async function routeHarness(kv, env = {}) {
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
    'relationships-store.mjs': S,
    'relationships-routes.mjs': relationshipsRoutes,
    'relationships-backfill.mjs': B,
  };
  async function load(relativePath) {
    const context = createContext({ process: { env }, console: { log() {}, error() {} } });
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
  const h = {
    roster: await load('../pages/api/relationships/roster.js'),
    backfill: await load('../pages/api/relationships/[contactId]/backfill.js'),
  };
  async function call(handler, { method, query = {}, body }, user = 'user-one') {
    const req = { method, query, body, headers: user ? { authorization: BEARER[user] } : {} };
    const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; }, setHeader() {} };
    await handler(req, res);
    return res;
  }
  return { h, call };
}

describe('routes', () => {
  test('POST roster runs the backfill inline and returns its summary alongside the person', async () => {
    const kv = new FakeKV().seed('contacts', CONTACTS).seed('tasks', [task('t1', { owner: 'Dan Okafor', status: 'done', updatedAt: daysAgo(6) })])
      .seed('meetings', [meeting('m_att', { participants: ['Dan Okafor'], date: daysAgo(20) })]);
    const { h, call } = await routeHarness(kv);
    const res = await call(h.roster, { method: 'POST', body: { contactId: 'c_dan', list: 'guests' } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.person.contact.name, 'Dan Okafor');
    assert.deepEqual(res.body.backfill.bySource, { meeting: 1, mail: 0, transcript: 0, task: 1 });
    assert.equal(res.body.person.rollup.lastTouchAbout, 'Task t1', 'the returned rollup already reflects the backfill (the done task is newer)');
    assert.equal(res.body.person.rollup.lastTouchInferred, true);
    assert.equal(res.body.person.rollup.lastFirmTouchAt, daysAgo(20), 'the meeting is the last firm touch');
  });

  test('POST backfill rescans an on-roster person and 404s otherwise', async () => {
    const kv = await seeded();
    seedEmails(kv, [email('e1', { sender_email: 'dan@northwind.com', sent_at: daysAgo(9) })]);
    const { h, call } = await routeHarness(kv);
    let res = await call(h.backfill, { method: 'POST', query: { contactId: 'c_dan' } });
    assert.equal(res.statusCode, 200); assert.equal(res.body.touchesAdded, 1); assert.equal(res.body.partial, false);
    res = await call(h.backfill, { method: 'POST', query: { contactId: 'c_dan' } });
    assert.equal(res.body.touchesAdded, 0, 'idempotent');
    assert.equal((await call(h.backfill, { method: 'POST', query: { contactId: 'c_priya' } })).statusCode, 404);
    assert.equal((await call(h.backfill, { method: 'GET', query: { contactId: 'c_dan' } })).statusCode, 405);
    assert.equal((await call(h.backfill, { method: 'POST', query: { contactId: 'c_dan' } }, null)).statusCode, 401);
  });
});

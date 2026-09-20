// PRD-14 Relationships: roster / touches / squawks / review store, ingest signals, the /api/relationships routes,
// the tasks PATCH hook and the rollup cron. Contract: docs/relationships-api.md. Run with: npm test
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as taskStore from '../lib/task-store.mjs';
import * as relationshipsStore from '../lib/relationships-store.mjs';
import * as relationshipsRoutes from '../lib/relationships-routes.mjs';
import * as relationshipsBackfill from '../lib/relationships-backfill.mjs';
import { CAS_SCRIPT } from '../lib/cas.mjs';

const S = relationshipsStore;
const USER = 'user-one';

// In-memory @vercel/kv: JSON values, MGET, the shared CAS Lua, sorted sets, and a command log.
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
  async zrange(k, start, stop) { this.#cmd('zrange'); const all = this.#sorted(k); return all.slice(start, stop === -1 ? undefined : stop + 1); }
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
  roster() { const raw = this.values.get(S.rosterKey(USER)); return raw ? JSON.parse(raw) : null; }
}

const contact = (id, name, extra = {}) => ({ id, userId: USER, name, aliases: [], role: 'Lead', company: 'Ascend', relationshipContext: '', deleted: false, ...extra });
const CONTACTS = [
  contact('c_ayan', 'Ayan Pal', { aliases: ['Ayen', 'Ion'] }),
  contact('c_dan', 'Dan Okafor', { company: 'Northwind', role: 'Product VP' }),
  contact('c_priya', 'Priya Raman'),
  contact('c_priya2', 'Priya Shah'),
  contact('c_al', 'Al Green'),
  contact('c_gone', 'Gone Person', { deleted: true }),
  { ...contact('c_theirs', 'Theirs Person'), userId: 'user-two' },
];
const task = (id, overrides = {}) => ({ id, userId: USER, task: `Task ${id}`, status: 'todo', createdAt: '2026-09-10T12:00:00Z', ...overrides });
const NOW = new Date('2026-09-19T12:00:00Z');
const daysAgo = n => new Date(NOW.getTime() - n * 86400000).toISOString();

async function seeded({ roster = true } = {}) {
  const kv = new FakeKV().seed('contacts', CONTACTS).seed('tasks', []).seed('meetings', []);
  if (roster) {
    await S.addToRoster(kv, USER, { contactId: 'c_ayan', list: 'crew' });
    await S.addToRoster(kv, USER, { contactId: 'c_priya', list: 'crew' });
    await S.addToRoster(kv, USER, { contactId: 'c_dan', list: 'guests' });
  }
  kv.log.length = 0;
  return kv;
}

describe('roster', () => {
  test('add appends with list defaults, renumbers ranks, and refuses duplicates', async () => {
    const kv = await seeded();
    const r = kv.roster();
    assert.deepEqual(r.crew.map(e => [e.contactId, e.rank, e.cadenceDays]), [['c_ayan', 1, 7], ['c_priya', 2, 7]]);
    assert.deepEqual(r.guests.map(e => [e.contactId, e.rank, e.cadenceDays]), [['c_dan', 1, 14]]);
    await assert.rejects(S.addToRoster(kv, USER, { contactId: 'c_dan', list: 'crew' }), e => e.status === 409 && e.code === 'already_on_roster');
    await assert.rejects(S.addToRoster(kv, USER, { contactId: 'c_al', list: 'crew', cadenceDays: 0 }), e => e.code === 'bad_cadence');
    await assert.rejects(S.addToRoster(kv, USER, { contactId: 'c_al', list: 'cabin' }), e => e.code === 'bad_list');
  });

  test('setRosterOrder rewrites order and ranks, keeps cadence/hold for survivors, marks leavers removed', async () => {
    const kv = await seeded();
    await S.patchEntry(kv, USER, 'c_ayan', { cadenceDays: 21, holdUntil: '2026-10-01T00:00:00Z' });
    const roster = await S.setRosterOrder(kv, USER, { crew: ['c_priya', 'c_al'], guests: ['c_ayan'] }, CONTACTS);
    assert.deepEqual(roster.crew.map(e => [e.contactId, e.rank, e.cadenceDays]), [['c_priya', 1, 7], ['c_al', 2, 7]]);
    assert.deepEqual(roster.guests.map(e => [e.contactId, e.rank, e.cadenceDays, e.holdUntil]), [['c_ayan', 1, 21, '2026-10-01T00:00:00.000Z']], 'moving lists keeps cadence and hold');
    assert.ok(kv.person('c_dan').removedAt, 'dan left the roster and is marked');
    await assert.rejects(S.setRosterOrder(kv, USER, { crew: ['c_priya'], guests: ['c_priya'] }, CONTACTS), e => e.code === 'duplicate_contact');
    await assert.rejects(S.setRosterOrder(kv, USER, { crew: ['c_nobody'], guests: [] }, CONTACTS), e => e.status === 404);
    await assert.rejects(S.setRosterOrder(kv, USER, { crew: ['c_theirs'], guests: [] }, CONTACTS), e => e.status === 404, "another user's contact is unknown");
  });

  test('remove and patch', async () => {
    const kv = await seeded();
    assert.equal(await S.removeFromRoster(kv, USER, 'c_priya'), true);
    assert.equal(await S.removeFromRoster(kv, USER, 'c_priya'), false);
    assert.ok(kv.person('c_priya').removedAt);
    const same = await S.patchEntry(kv, USER, 'c_ayan', { cadenceDays: 10 });
    assert.equal(same.rank, 1, 'editing cadence keeps the position');
    const moved = await S.patchEntry(kv, USER, 'c_ayan', { list: 'guests', holdUntil: null });
    assert.equal(moved.list, 'guests'); assert.equal(moved.rank, 2); assert.equal(moved.holdUntil, null);
    assert.equal(kv.roster().crew.length, 0);
    assert.equal(await S.patchEntry(kv, USER, 'c_nobody', { cadenceDays: 3 }), null);
    // coming back clears the removal marker
    await S.addToRoster(kv, USER, { contactId: 'c_priya', list: 'crew' });
    assert.equal(kv.person('c_priya').removedAt, null);
  });
});

describe('touches and rollup', () => {
  test('touches are newest first and capped at 200; delete recomputes', async () => {
    const kv = await seeded();
    for (let i = 0; i < 205; i++) await S.addTouch(kv, USER, 'c_ayan', { at: daysAgo(300 - i), channel: 'note', about: `n${i}` });
    const p = kv.person('c_ayan');
    assert.equal(p.touches.length, 200);
    assert.equal(p.touches[0].about, 'n204', 'newest first');
    assert.equal(p.touches.at(-1).about, 'n5', 'the five oldest fell off');
    const rollup = await S.deleteTouch(kv, USER, 'c_ayan', p.touches[0].id);
    assert.equal(rollup.lastTouchAbout, 'n203');
    assert.equal(await S.deleteTouch(kv, USER, 'c_ayan', 'nope'), null);
    await assert.rejects(S.addTouch(kv, USER, 'c_ayan', { channel: 'telepathy' }), e => e.code === 'bad_channel');
  });

  test('threads follow the relation rules and the rollup counts them', () => {
    const ayan = CONTACTS[0];
    const tasks = [
      task('t1', { owner: 'Ayan Pal', status: 'in-progress' }),                                 // theirs
      task('t2', { owner: 'ayen', status: 'todo' }),                                            // theirs via alias
      task('t3', { owner: 'Me', person: 'Ayan Pal', status: 'todo' }),                          // mine → owed
      task('t4', { owner: 'Me', person: 'Ayan', status: 'waiting' }),                           // waiting on them (first name)
      task('t5', { owner: 'Me', person: 'Ayan Pal', type: 'follow-up', status: 'todo' }),       // waiting on them
      task('t6', { owner: 'Ayan Pal', status: 'done' }),                                        // done → not a thread
      task('t7', { owner: 'Ayan Pal', deleted: true }),                                         // trashed
      task('t8', { owner: 'Ayan Pal', archived: true }),                                        // archived
      task('t9', { owner: 'Someone', status: 'todo' }),                                         // unrelated → pinned below
      task('t10', { owner: 'Ayan Pal', userId: 'user-two' }),                                   // another user
      task('t11', { owner: 'Me', person: 'Dan Okafor', status: 'todo' }),                       // someone else
    ];
    const threads = S.threadsFor(ayan, tasks, ['t9'], USER);
    assert.deepEqual(Object.fromEntries(threads.map(t => [t.taskId, t.relation])),
      { t1: 'theirs', t2: 'theirs', t3: 'mine', t4: 'waitingOnThem', t5: 'waitingOnThem', t9: 'mine' });
    assert.equal(threads.find(t => t.taskId === 't9').pinned, true);
    assert.equal(threads[0].gate, threads[0].taskId.slice(-4).toUpperCase());
    const person = {
      touches: [
        { id: 'a', at: daysAgo(2), channel: 'work', about: 'x', inferred: true },
        { id: 'b', at: daysAgo(20), channel: 'meeting', about: 'y', inferred: false },
        { id: 'c', at: daysAgo(80), channel: 'call', about: 'z', inferred: false },
        { id: 'd', at: daysAgo(200), channel: 'mail', about: 'w', inferred: false },
      ],
      squawks: [{ id: 's1', raisedAt: null }, { id: 's2', raisedAt: daysAgo(1) }],
      pinnedTaskIds: ['t9'],
    };
    const r = S.computeRollup(person, { contact: ayan, tasks, userId: USER, now: NOW });
    assert.equal(r.lastTouchAt, daysAgo(2)); assert.equal(r.lastTouchInferred, true);
    assert.equal(r.lastFirmTouchAt, daysAgo(20), 'the client uses the firm touch for NO RADIO');
    assert.equal(r.touches30d, 2); assert.equal(r.touches90d, 3);
    assert.equal(r.openThreads, 6); assert.equal(r.owed, 2); assert.equal(r.waitingOn, 2); assert.equal(r.openSquawks, 1);
  });

  test('mentions come from task text and meeting participation, newest first, capped', () => {
    const dan = CONTACTS[1];
    const tasks = [
      task('m1', { task: 'Send Dan the deck', context: 'Dan asked twice.', createdAt: '2026-09-10T00:00:00Z' }),
      task('m2', { task: 'Book flights', createdAt: '2026-09-11T00:00:00Z' }),
      task('m3', { task: 'Danielle review', createdAt: '2026-09-12T00:00:00Z' }),          // not a whole-word match
      ...Array.from({ length: 25 }, (_, i) => task(`x${i}`, { task: 'Ping Dan', createdAt: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00Z` })),
    ];
    const meetings = [
      { id: 'mt1', userId: USER, title: 'Q3 roadmap', participants: ['Dan Okafor'], date: '2026-09-15' },
      { id: 'mt2', userId: USER, title: 'Standup', participants: ['Priya Raman'], date: '2026-09-16' },
      { id: 'mt3', userId: 'user-two', title: 'Dan Okafor 1:1', participants: ['Dan Okafor'], date: '2026-09-17' },
    ];
    const mentions = S.mentionsFor(dan, tasks, meetings, USER);
    assert.equal(mentions.length, S.MENTION_CAP);
    assert.deepEqual(mentions.slice(0, 2).map(m => [m.source, m.ref]), [['meeting', 'mt1'], ['task', 'm1']]);
    assert.ok(!mentions.some(m => m.ref === 'm3' || m.ref === 'mt2' || m.ref === 'mt3'));
  });
});

describe('resolveContact', () => {
  const all = S.userContacts(CONTACTS, USER);
  test('id, exact name, alias, unique first name; ambiguous and short first names fail; deleted excluded', () => {
    assert.equal(S.resolveContact('c_dan', all).id, 'c_dan');
    assert.equal(S.resolveContact('  ayan pal ', all).id, 'c_ayan');
    assert.equal(S.resolveContact('ION', all).id, 'c_ayan');
    assert.equal(S.resolveContact('Dan', all).id, 'c_dan');
    assert.equal(S.resolveContact('Priya', all), null, 'two Priyas');
    assert.equal(S.resolveContact('Al', all), null, 'two letters never match a first name');
    assert.equal(S.resolveContact('Al Green', all).id, 'c_al');
    assert.equal(S.resolveContact('Gone Person', all), null);
    assert.equal(S.resolveContact('Theirs Person', all), null);
    assert.equal(S.resolveContact('', all), null);
  });
});

describe('recordSignal', () => {
  test('high → touch, medium → review, sourceRef de-dupes both, not-on-roster and unresolved are skipped', async () => {
    const kv = await seeded();
    const high = await S.recordSignal(kv, { userId: USER, name: 'Ayen', at: daysAgo(1), channel: 'meeting', about: 'Sync', source: 'meeting', sourceRef: 'meeting:m1', confidence: 'high' });
    assert.equal(high.outcome, 'touch'); assert.equal(high.contactId, 'c_ayan');
    assert.equal(kv.person('c_ayan').touches.length, 1);
    assert.equal(kv.person('c_ayan').rollup.lastTouchAbout, 'Sync');
    const dup = await S.recordSignal(kv, { userId: USER, name: 'Ayan Pal', at: daysAgo(1), channel: 'meeting', about: 'Sync', source: 'meeting', sourceRef: 'meeting:m1', confidence: 'high' });
    assert.deepEqual([dup.outcome, dup.reason], ['skipped', 'duplicate']);
    const med = await S.recordSignal(kv, { userId: USER, name: 'Dan', at: daysAgo(0), channel: 'chat', about: 'Teams chat with Dan Okafor', excerpt: 'can you send…', source: 'glimpse', sourceRef: 'glimpse:i1' });
    assert.equal(med.outcome, 'review');
    const items = await S.listReview(kv, USER);
    assert.equal(items.length, 1); assert.equal(items[0].contactId, 'c_dan'); assert.equal(items[0].signal, 'chat'); assert.equal(items[0].excerpt, 'can you send…');
    assert.equal(kv.person('c_dan').touches.length, 0, 'a review item is not a touch');
    const dup2 = await S.recordSignal(kv, { userId: USER, name: 'Dan', at: daysAgo(0), channel: 'chat', source: 'glimpse', sourceRef: 'glimpse:i1' });
    assert.equal(dup2.reason, 'duplicate'); assert.equal(await S.reviewCount(kv, USER), 1);
    assert.deepEqual((await S.recordSignal(kv, { userId: USER, name: 'Al Green', at: daysAgo(0), channel: 'chat', source: 'glimpse' })).reason, 'not_on_roster');
    assert.deepEqual((await S.recordSignal(kv, { userId: USER, name: 'Nobody', at: daysAgo(0), channel: 'chat', source: 'glimpse' })).reason, 'unresolved');
    assert.deepEqual((await S.recordSignal(kv, { userId: USER, name: 'Dan', at: daysAgo(0), channel: 'fax', source: 'glimpse' })).reason, 'bad_channel');
  });

  test('accepting review items writes a touch and trusts the source after 10; rejecting three times mutes it', async () => {
    const kv = await seeded();
    for (let i = 0; i < 10; i++) {
      const r = await S.recordSignal(kv, { userId: USER, contactId: 'c_dan', at: daysAgo(i + 1), channel: 'chat', about: `chat ${i}`, source: 'glimpse', sourceRef: `g:${i}` });
      assert.equal(r.outcome, 'review');
      const res = await S.resolveReview(kv, USER, r.item.id, { accept: true, contacts: CONTACTS, tasks: [] });
      assert.equal(res.accepted, true); assert.equal(res.touch.source, 'glimpse'); assert.equal(res.touch.inferred, false);
    }
    assert.equal(kv.person('c_dan').accepted.glimpse, 10);
    assert.equal(kv.person('c_dan').touches.length, 10);
    const trusted = await S.recordSignal(kv, { userId: USER, contactId: 'c_dan', at: daysAgo(0), channel: 'chat', about: 'auto', source: 'glimpse', sourceRef: 'g:auto' });
    assert.equal(trusted.outcome, 'touch', 'the eleventh glimpse chat is trusted');
    assert.equal(await S.reviewCount(kv, USER), 0);

    for (let i = 0; i < 3; i++) {
      const r = await S.recordSignal(kv, { userId: USER, contactId: 'c_ayan', at: daysAgo(0), channel: 'mail', source: 'mail', sourceRef: `mail:${i}` });
      const res = await S.resolveReview(kv, USER, r.item.id, { accept: false, contacts: CONTACTS });
      assert.equal(res.accepted, false);
    }
    assert.deepEqual(kv.person('c_ayan').mutedSources, ['mail']);
    const muted = await S.recordSignal(kv, { userId: USER, contactId: 'c_ayan', at: daysAgo(0), channel: 'mail', source: 'mail', sourceRef: 'mail:9' });
    assert.equal(muted.reason, 'muted');
    assert.equal(await S.resolveReview(kv, USER, 'r_nope', { accept: true, contacts: CONTACTS }), null);
  });

  test('accept with aliasOf redirects the touch to the other contact', async () => {
    const kv = await seeded();
    const r = await S.recordSignal(kv, { userId: USER, contactId: 'c_dan', at: daysAgo(0), channel: 'chat', about: 'x', source: 'glimpse', sourceRef: 'g:1' });
    const res = await S.resolveReview(kv, USER, r.item.id, { accept: true, aliasOf: 'c_ayan', contacts: CONTACTS, tasks: [] });
    assert.equal(res.accepted, true);
    assert.equal(kv.person('c_ayan').touches.length, 1);
    assert.equal(kv.person('c_dan').touches.length, 0);
  });

  test('review tray is trimmed to 50 oldest-first', async () => {
    const kv = await seeded();
    for (let i = 0; i < 60; i++) await S.recordSignal(kv, { userId: USER, contactId: 'c_dan', at: daysAgo(100 - i), channel: 'chat', source: 'glimpse', sourceRef: `g:${i}` });
    const items = await S.listReview(kv, USER);
    assert.equal(items.length, 50);
    assert.equal(Date.parse(items[0].at) < Date.parse(items[49].at), true);
    assert.equal(items[49].sourceRef, 'g:59', 'the newest survive');
  });
});

describe('ingest hooks', () => {
  test('a stored meeting touches roster participants once, and people named twice in title+summary', async () => {
    const kv = await seeded();
    const meeting = { id: 'm_1', userId: USER, title: 'Q3 roadmap with Ayen', summary: 'Dan pushed on pricing. Dan will confirm by Friday.', participants: ['Ayan Pal', 'Al Green'], date: '2026-09-15' };
    const results = await S.recordMeetingSignals(kv, meeting);
    assert.deepEqual(results.map(r => [r.contactId, r.outcome]).sort(), [['c_ayan', 'touch'], ['c_dan', 'touch']], 'Al is not on the roster; Priya is not mentioned');
    assert.equal(kv.person('c_ayan').touches[0].sourceRef, 'meeting:m_1');
    assert.equal(kv.person('c_ayan').touches[0].channel, 'meeting');
    const again = await S.recordMeetingSignals(kv, meeting);
    assert.ok(again.every(r => r.reason === 'duplicate'), 'replaying the same meeting writes nothing');
    assert.equal(kv.person('c_ayan').touches.length, 1);
    const once = await S.recordMeetingSignals(kv, { id: 'm_2', userId: USER, title: 'Priya review', summary: 'nothing else', participants: [] });
    assert.deepEqual(once, [], 'a single mention is not attendance');
  });

  test('a task becoming done writes an inferred work touch for the roster owner or person', async () => {
    const kv = await seeded();
    const results = await S.recordTaskDone(kv, task('t_1', { owner: 'Me', person: 'Dan Okafor', status: 'done', updatedAt: daysAgo(0) }));
    assert.deepEqual(results.map(r => [r.contactId, r.outcome]), [['c_dan', 'touch']]);
    const t = kv.person('c_dan').touches[0];
    assert.equal(t.inferred, true); assert.equal(t.channel, 'work'); assert.equal(t.confidence, 'medium'); assert.equal(t.sourceRef, 'task-done:t_1');
    assert.equal(kv.person('c_dan').rollup.lastFirmTouchAt, null, 'inferred touches never count as firm');
    assert.deepEqual(await S.recordTaskDone(kv, task('t_2', { owner: 'Me', status: 'done' })), []);
  });
});

// ---------------------------------------------------------------------------
// Routes through the real handlers

const BEARER = { 'user-one': 'Bearer test-one', 'user-two': 'Bearer test-two' };

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
    'relationships-store.mjs': relationshipsStore,
    'relationships-routes.mjs': relationshipsRoutes,
    'relationships-backfill.mjs': relationshipsBackfill,
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
    list: await load('../pages/api/relationships/index.js'),
    roster: await load('../pages/api/relationships/roster.js'),
    rosterId: await load('../pages/api/relationships/roster/[contactId].js'),
    person: await load('../pages/api/relationships/[contactId]/index.js'),
    rundown: await load('../pages/api/relationships/[contactId]/rundown.js'),
    touches: await load('../pages/api/relationships/[contactId]/touches/index.js'),
    touchId: await load('../pages/api/relationships/[contactId]/touches/[touchId].js'),
    squawks: await load('../pages/api/relationships/[contactId]/squawks/index.js'),
    squawkId: await load('../pages/api/relationships/[contactId]/squawks/[squawkId].js'),
    pins: await load('../pages/api/relationships/[contactId]/pins/index.js'),
    pinId: await load('../pages/api/relationships/[contactId]/pins/[taskId].js'),
    review: await load('../pages/api/relationships/review/index.js'),
    reviewId: await load('../pages/api/relationships/review/[id].js'),
    taskById: await load('../pages/api/tasks/[id].js'),
    cron: await load('../pages/api/cron/relationships-rollup.js'),
  };
  const call = async (handler, req, user = 'user-one') => {
    const res = { statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    const headers = { ...(user ? { authorization: BEARER[user] } : {}), ...(req.headers || {}) };
    await handler({ query: {}, body: {}, ...req, headers }, res);
    if (res.body !== undefined) res.body = JSON.parse(JSON.stringify(res.body));
    return res;
  };
  return { h, call };
}

describe('routes', () => {
  test('GET list, roster PUT/POST/DELETE, PATCH person', async () => {
    const kv = await seeded({ roster: false });
    const { h, call } = await routeHarness(kv);
    assert.equal((await call(h.list, { method: 'GET' }, null)).statusCode, 401);
    let res = await call(h.roster, { method: 'POST', body: { contactId: 'c_ayan', list: 'crew' } });
    assert.equal(res.statusCode, 201); assert.equal(res.body.person.entry.cadenceDays, 7); assert.equal(res.body.person.contact.name, 'Ayan Pal');
    assert.equal((await call(h.roster, { method: 'POST', body: { contactId: 'c_ayan', list: 'guests' } })).statusCode, 409);
    assert.equal((await call(h.roster, { method: 'POST', body: { contactId: 'c_nobody', list: 'guests' } })).statusCode, 404);
    assert.equal((await call(h.roster, { method: 'POST', body: { contactId: 'c_dan', list: 'guests', cadenceDays: 30 } })).body.person.entry.cadenceDays, 30);
    res = await call(h.list, { method: 'GET' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.people.map(p => [p.entry.list, p.entry.rank, p.contact.id]), [['crew', 1, 'c_ayan'], ['guests', 1, 'c_dan']]);
    assert.equal(res.body.reviewCount, 0); assert.ok(res.body.people[0].rollup.computedAt, 'rollups are filled in lazily');
    res = await call(h.roster, { method: 'PUT', body: { crew: ['c_priya', 'c_ayan'], guests: ['c_dan'] } });
    assert.deepEqual(res.body.people.map(p => p.contact.id), ['c_priya', 'c_ayan', 'c_dan']);
    res = await call(h.person, { method: 'PATCH', query: { contactId: 'c_dan' }, body: { cadenceDays: 21, holdUntil: '2026-10-03T00:00:00Z', mutedSources: ['glimpse:Microsoft Teams'] } });
    assert.equal(res.statusCode, 200); assert.equal(res.body.person.entry.cadenceDays, 21); assert.deepEqual(res.body.mutedSources, ['glimpse:Microsoft Teams']);
    assert.equal((await call(h.person, { method: 'PATCH', query: { contactId: 'c_dan' }, body: { cadenceDays: 900 } })).statusCode, 400);
    assert.equal((await call(h.person, { method: 'PATCH', query: { contactId: 'c_al' }, body: { cadenceDays: 9 } })).statusCode, 404);
    assert.equal((await call(h.rosterId, { method: 'DELETE', query: { contactId: 'c_dan' } })).statusCode, 200);
    assert.equal((await call(h.rosterId, { method: 'DELETE', query: { contactId: 'c_dan' } })).statusCode, 404);
    assert.equal((await call(h.list, { method: 'GET' })).body.people.length, 2);
  });

  test('touches, squawks, pins and the rundown', async () => {
    const kv = await seeded();
    kv.seed('tasks', [task('task_00s16', { owner: 'Me', person: 'Dan Okafor', status: 'todo', dueDate: '2026-09-30' }), task('task_9001', { owner: 'Someone' })]);
    kv.seed('meetings', [{ id: 'm_q3', userId: USER, title: 'Q3 roadmap', participants: ['Dan Okafor'], date: '2026-09-15' }]);
    const { h, call } = await routeHarness(kv);
    let res = await call(h.touches, { method: 'POST', query: { contactId: 'c_dan' }, body: { channel: 'call', about: 'Pricing', at: daysAgo(1) } });
    assert.equal(res.statusCode, 201); assert.equal(res.body.touch.source, 'manual'); assert.equal(res.body.rollup.lastTouchAbout, 'Pricing'); assert.equal(res.body.rollup.owed, 1);
    const touchId = res.body.touch.id;
    assert.equal((await call(h.touches, { method: 'POST', query: { contactId: 'c_dan' }, body: { channel: 'fax' } })).statusCode, 400);
    assert.equal((await call(h.touches, { method: 'POST', query: { contactId: 'c_al' }, body: { channel: 'call' } })).statusCode, 404);
    assert.equal((await call(h.touches, { method: 'GET', query: { contactId: 'c_dan', limit: '5' } })).body.touches.length, 1);
    res = await call(h.squawks, { method: 'POST', query: { contactId: 'c_dan' }, body: { text: 'Renewal pricing range', type: 'ask' } });
    assert.equal(res.statusCode, 201); const squawkId = res.body.squawk.id;
    assert.equal((await call(h.squawks, { method: 'POST', query: { contactId: 'c_dan' }, body: { text: 'x', type: 'moan' } })).statusCode, 400);
    res = await call(h.squawkId, { method: 'PATCH', query: { contactId: 'c_dan', squawkId }, body: { raisedAt: daysAgo(0) } });
    assert.ok(res.body.squawk.raisedAt);
    res = await call(h.pins, { method: 'POST', query: { contactId: 'c_dan' }, body: { taskId: 'task_9001' } });
    assert.deepEqual(res.body.pinnedTaskIds, ['task_9001']);
    assert.equal((await call(h.pins, { method: 'POST', query: { contactId: 'c_dan' }, body: { taskId: 'nope' } })).statusCode, 404);
    res = await call(h.rundown, { method: 'GET', query: { contactId: 'c_dan' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.threads.map(t => [t.taskId, t.relation, t.gate]), [['task_00s16', 'mine', '0S16'], ['task_9001', 'mine', '9001']]);
    assert.equal(res.body.squawks.length, 1); assert.equal(res.body.touches.length, 1);
    assert.deepEqual(res.body.mentions.map(m => m.ref), ['m_q3', 'task_00s16']);
    assert.equal(res.body.person.rollup.openSquawks, 0);
    assert.equal((await call(h.rundown, { method: 'GET', query: { contactId: 'c_al' } })).statusCode, 404);
    res = await call(h.pinId, { method: 'DELETE', query: { contactId: 'c_dan', taskId: 'task_9001' } });
    assert.deepEqual(res.body.pinnedTaskIds, []);
    assert.equal((await call(h.squawkId, { method: 'DELETE', query: { contactId: 'c_dan', squawkId } })).statusCode, 200);
    assert.equal((await call(h.squawkId, { method: 'DELETE', query: { contactId: 'c_dan', squawkId } })).statusCode, 404);
    res = await call(h.touchId, { method: 'DELETE', query: { contactId: 'c_dan', touchId } });
    assert.equal(res.statusCode, 200); assert.equal(res.body.rollup.lastTouchAt, null);
    assert.equal((await call(h.touchId, { method: 'DELETE', query: { contactId: 'c_dan', touchId } })).statusCode, 404);
  });

  test('review routes', async () => {
    const kv = await seeded();
    await S.recordSignal(kv, { userId: USER, contactId: 'c_dan', at: daysAgo(0), channel: 'chat', about: 'Teams chat', source: 'glimpse', sourceRef: 'g:1' });
    await S.recordSignal(kv, { userId: USER, contactId: 'c_ayan', at: daysAgo(0), channel: 'mail', about: 'Re: deck', source: 'mail', sourceRef: 'mail:1' });
    const { h, call } = await routeHarness(kv);
    let res = await call(h.review, { method: 'GET' });
    assert.equal(res.body.items.length, 2);
    const dan = res.body.items.find(i => i.contactId === 'c_dan'), ayan = res.body.items.find(i => i.contactId === 'c_ayan');
    assert.equal((await call(h.reviewId, { method: 'POST', query: { id: dan.id }, body: {} })).statusCode, 400);
    res = await call(h.reviewId, { method: 'POST', query: { id: dan.id }, body: { accept: true } });
    assert.equal(res.statusCode, 200); assert.equal(res.body.accepted, true); assert.equal(res.body.touch.channel, 'chat');
    res = await call(h.reviewId, { method: 'POST', query: { id: ayan.id }, body: { accept: false } });
    assert.equal(res.body.accepted, false);
    assert.equal((await call(h.reviewId, { method: 'POST', query: { id: ayan.id }, body: { accept: false } })).statusCode, 404);
    assert.equal((await call(h.list, { method: 'GET' })).body.reviewCount, 0);
  });

  test('PATCH /api/tasks/<id> to done writes an inferred touch through the real route', async () => {
    const kv = await seeded();
    kv.seed('tasks', [{ ...task('task_1', { owner: 'Me', person: 'Dan Okafor', status: 'todo' }), activity: [] }]);
    const { h, call } = await routeHarness(kv);
    let res = await call(h.taskById, { method: 'PATCH', query: { id: 'task_1' }, body: { status: 'done' } });
    assert.equal(res.statusCode, 200);
    assert.equal(kv.person('c_dan').touches.length, 1);
    assert.equal(kv.person('c_dan').touches[0].inferred, true);
    res = await call(h.taskById, { method: 'PATCH', query: { id: 'task_1' }, body: { priority: 'high' } });
    assert.equal(kv.person('c_dan').touches.length, 1, 'other edits are not touches');
  });

  test('cron: auth, rollups, hold expiry, trim, and the command budget', async () => {
    const kv = await seeded();
    await S.patchEntry(kv, USER, 'c_dan', { holdUntil: '2020-01-01T00:00:00Z' });
    await S.patchEntry(kv, USER, 'c_ayan', { holdUntil: '2999-01-01T00:00:00Z' });
    const env = { CRON_SECRET: 'cron-secret', INBOUND_EMAIL_USER_ID: USER };
    const { h, call } = await routeHarness(kv, env);
    assert.equal((await call(h.cron, { method: 'GET', headers: { authorization: 'Bearer wrong' } }, null)).statusCode, 401);
    kv.log.length = 0;
    const res = await call(h.cron, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } }, null);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.people, 3); assert.equal(res.body.holdsExpired, 1);
    assert.ok(res.body.commands > 0 && res.body.commands <= 400);
    assert.ok(!kv.log.includes('scan') && !kv.log.includes('keys'));
    const roster = kv.roster();
    assert.equal(roster.guests[0].holdUntil, null, "dan's expired hold is cleared");
    assert.equal(roster.crew[0].holdUntil, '2999-01-01T00:00:00.000Z', "ayan's hold stays");
    assert.ok(kv.person('c_priya').rollup.computedAt);
    // budget: a tiny cap fails fast and reports partial
    const { kv: tiny, counter } = S.countingKV(kv, 2);
    await assert.rejects(S.rollupAll(tiny, USER), e => e.code === 'budget_exhausted');
    assert.equal(counter.commands, 3);
  });
});

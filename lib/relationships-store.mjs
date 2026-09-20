// Relationships (PRD-14): the roster of people the owner leads (crew) and delivers to (guests), with
// per-person touches, squawks, pins and a rollup the People tab and /relationships read.
// Contract: docs/relationships-api.md. Bands and queue order are computed by the clients.
//
// Storage (per-person keys, never one growing array):
//   rel:<userHash>:roster              { crew: [RosterEntry], guests: [RosterEntry], updatedAt }  CAS via :version
//   rel:<userHash>:person:<contactId>  { touches ≤ 200 newest first, squawks, pinnedTaskIds, mutedSources,
//                                        accepted, rejected, seen ≤ 500, rollup, removedAt? }         CAS via :version
//   rel:<userHash>:review              zset score = at (ms), member = ReviewItem JSON, trimmed to 50
// No SCAN anywhere; every loop is bounded by the roster (≤ MAX_ROSTER) or a fixed cap.
import { createHash } from 'node:crypto';
import { updateJSON } from './cas.mjs';

export const LISTS = ['crew', 'guests'];
export const DEFAULT_CADENCE = { crew: 7, guests: 14 };
export const CHANNELS = ['meeting', 'call', 'chat', 'mail', 'work', 'note'];
export const SQUAWK_TYPES = ['raise', 'feedback', 'ask'];
export const TOUCH_CAP = 200;
export const SEEN_CAP = 500;
export const REVIEW_CAP = 50;
export const MAX_ROSTER = 100;
export const AUTO_TRUST_AFTER = 10;
export const MUTE_AFTER_REJECTIONS = 3;
export const MENTION_CAP = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const userHash = userId => hash(userId).slice(0, 16);
export const rosterKey = userId => `rel:${userHash(userId)}:roster`;
export const rosterVersionKey = userId => `${rosterKey(userId)}:version`;
export const personKey = (userId, contactId) => `rel:${userHash(userId)}:person:${contactId}`;
export const personVersionKey = (userId, contactId) => `${personKey(userId, contactId)}:version`;
export const reviewKey = userId => `rel:${userHash(userId)}:review`;

export class RelationshipsError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'RelationshipsError';
    this.status = status;
    this.code = code;
  }
}
const bad = (code, message) => new RelationshipsError(400, code, message);

const newId = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const iso = value => (value instanceof Date ? value : new Date(value ?? Date.now())).toISOString();
const emptyRoster = () => ({ crew: [], guests: [], updatedAt: null });
const emptyPerson = () => ({ touches: [], squawks: [], pinnedTaskIds: [], mutedSources: [], accepted: {}, rejected: {}, seen: [], rollup: null });
const norm = s => String(s ?? '').trim().toLowerCase();
const isMe = owner => ['me', 'myself', 'i'].includes(norm(owner));

// ---------------------------------------------------------------------------
// Contacts

/** Non-deleted contacts for a user. */
export function userContacts(contacts, userId) {
  return (Array.isArray(contacts) ? contacts : []).filter(c => c && c.userId === userId && !c.deleted);
}

function contactForms(contact) {
  return [contact.name, ...(Array.isArray(contact.aliases) ? contact.aliases : [])].map(norm).filter(Boolean);
}

/**
 * Resolve a contact id or a free-text name: id → exact name or alias (case-insensitive) → a bare first
 * name of three or more letters when exactly one contact starts with it. Returns the contact or null.
 */
export function resolveContact(nameOrId, contacts) {
  const list = Array.isArray(contacts) ? contacts : [];
  if (!nameOrId) return null;
  const byId = list.find(c => c.id === nameOrId);
  if (byId) return byId;
  const wanted = norm(nameOrId);
  if (!wanted) return null;
  const exact = list.find(c => contactForms(c).includes(wanted));
  if (exact) return exact;
  if (wanted.length >= 3 && !wanted.includes(' ')) {
    const firsts = list.filter(c => norm(c.name).split(/\s+/)[0] === wanted);
    if (firsts.length === 1) return firsts[0];
  }
  return null;
}

/** True when `text` names the contact (name, alias, or a 3+ letter first name) as a whole word. */
export function mentionsContact(text, contact) {
  const haystack = ` ${norm(text).replace(/[^a-z0-9'’\-\s]+/g, ' ')} `;
  const forms = contactForms(contact);
  const first = norm(contact.name).split(/\s+/)[0];
  if (first.length >= 3) forms.push(first);
  return forms.some(f => haystack.includes(` ${f} `));
}

export function countMentions(text, contact) {
  const words = norm(text).replace(/[^a-z0-9'’\-\s]+/g, ' ').split(/\s+/).filter(Boolean);
  const forms = new Set(contactForms(contact));
  const first = norm(contact.name).split(/\s+/)[0];
  if (first.length >= 3) forms.add(first);
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    for (const f of forms) {
      const parts = f.split(/\s+/);
      if (parts.every((p, j) => words[i + j] === p)) { n++; break; }
    }
  }
  return n;
}

export function publicContact(contact) {
  if (!contact) return null;
  return { id: contact.id, name: contact.name, role: contact.role || '', company: contact.company || '', relationshipContext: contact.relationshipContext || '' };
}

// ---------------------------------------------------------------------------
// Roster

export async function getRoster(kv, userId) {
  const stored = await kv.get(rosterKey(userId));
  return stored && typeof stored === 'object' ? { ...emptyRoster(), ...stored } : emptyRoster();
}

/** Every entry across both lists, crew first, rank order. */
export function rosterEntries(roster) {
  return LISTS.flatMap(list => (roster[list] || []).map(e => ({ ...e, list })));
}

export function findEntry(roster, contactId) {
  return rosterEntries(roster).find(e => e.contactId === contactId) || null;
}

function renumber(roster) {
  for (const list of LISTS) {
    roster[list] = (roster[list] || []).map((e, i) => ({ ...e, list, rank: i + 1 }));
  }
  roster.updatedAt = iso();
  return roster;
}

export async function updateRoster(kv, userId, mutate) {
  return updateJSON(kv, rosterKey(userId), rosterVersionKey(userId), async current => {
    const roster = { ...emptyRoster(), ...(current || {}) };
    const outcome = await mutate(roster);
    if (outcome === null || outcome === undefined) return null;
    return { ...outcome, value: renumber(outcome.value ?? roster) };
  }, { initial: emptyRoster });
}

function validateCadence(days) {
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw bad('bad_cadence', 'cadenceDays must be an integer from 1 to 365.');
  return n;
}

function validateList(list) {
  if (!LISTS.includes(list)) throw bad('bad_list', `list must be one of ${LISTS.join(', ')}.`);
  return list;
}

/** Append a contact to a list. 409 when already on the roster. */
export async function addToRoster(kv, userId, { contactId, list, cadenceDays }) {
  validateList(list);
  const cadence = cadenceDays === undefined ? DEFAULT_CADENCE[list] : validateCadence(cadenceDays);
  const outcome = await updateRoster(kv, userId, roster => {
    if (findEntry(roster, contactId)) throw new RelationshipsError(409, 'already_on_roster', 'This person is already on the roster.');
    if (rosterEntries(roster).length >= MAX_ROSTER) throw new RelationshipsError(409, 'roster_full', `The roster holds at most ${MAX_ROSTER} people.`);
    roster[list] = [...(roster[list] || []), { contactId, list, rank: 0, cadenceDays: cadence, holdUntil: null, addedAt: iso() }];
    return { value: roster };
  });
  // A person coming back within 30 days keeps their history: clear the removal marker.
  await updatePerson(kv, userId, contactId, person => ({ value: { ...person, removedAt: null } }));
  return findEntry(outcome.value, contactId);
}

/** Replace both lists' order. Unknown ids are dropped; new ids get defaults; leavers get a removal marker. */
export async function setRosterOrder(kv, userId, { crew = [], guests = [] }, contacts) {
  const ids = [...crew, ...guests].map(String);
  if (new Set(ids).size !== ids.length) throw bad('duplicate_contact', 'A contact may appear once across both lists.');
  if (ids.length > MAX_ROSTER) throw new RelationshipsError(409, 'roster_full', `The roster holds at most ${MAX_ROSTER} people.`);
  const known = new Set(userContacts(contacts, userId).map(c => c.id));
  const unknown = ids.filter(id => !known.has(id));
  if (unknown.length) throw new RelationshipsError(404, 'unknown_contact', `Unknown contact: ${unknown[0]}`);
  let leavers = [];
  const outcome = await updateRoster(kv, userId, roster => {
    const before = new Map(rosterEntries(roster).map(e => [e.contactId, e]));
    const build = (list, order) => order.map(contactId => {
      const prev = before.get(contactId);
      return { contactId, list, rank: 0, cadenceDays: prev?.cadenceDays ?? DEFAULT_CADENCE[list], holdUntil: prev?.holdUntil ?? null, addedAt: prev?.addedAt ?? iso() };
    });
    const next = { ...roster, crew: build('crew', crew), guests: build('guests', guests) };
    leavers = [...before.keys()].filter(id => !ids.includes(id));
    return { value: next };
  });
  for (const contactId of leavers.slice(0, MAX_ROSTER)) {
    await updatePerson(kv, userId, contactId, person => ({ value: { ...person, removedAt: iso() } }));
  }
  return outcome.value;
}

export async function removeFromRoster(kv, userId, contactId) {
  const outcome = await updateRoster(kv, userId, roster => {
    if (!findEntry(roster, contactId)) return null;
    for (const list of LISTS) roster[list] = (roster[list] || []).filter(e => e.contactId !== contactId);
    return { value: roster };
  });
  if (!outcome) return false;
  await updatePerson(kv, userId, contactId, person => ({ value: { ...person, removedAt: iso() } }));
  return true;
}

/** cadenceDays / holdUntil / list (move to the end of the other list). */
export async function patchEntry(kv, userId, contactId, { cadenceDays, holdUntil, list }) {
  const outcome = await updateRoster(kv, userId, roster => {
    const entry = findEntry(roster, contactId);
    if (!entry) return null;
    const next = { ...entry };
    if (cadenceDays !== undefined) next.cadenceDays = validateCadence(cadenceDays);
    if (holdUntil !== undefined) {
      if (holdUntil !== null && Number.isNaN(Date.parse(holdUntil))) throw bad('bad_hold', 'holdUntil must be an ISO date or null.');
      next.holdUntil = holdUntil === null ? null : iso(holdUntil);
    }
    const target = list === undefined ? entry.list : validateList(list);
    next.list = target;
    if (target === entry.list) {
      // Same list: edit in place so rank order is untouched.
      roster[target] = (roster[target] || []).map(e => e.contactId === contactId ? next : e);
    } else {
      for (const l of LISTS) roster[l] = (roster[l] || []).filter(e => e.contactId !== contactId);
      roster[target] = [...(roster[target] || []), next];
    }
    return { value: roster };
  });
  return outcome ? findEntry(outcome.value, contactId) : null;
}

// ---------------------------------------------------------------------------
// Person key

export async function getPerson(kv, userId, contactId) {
  const stored = await kv.get(personKey(userId, contactId));
  return { ...emptyPerson(), ...(stored || {}) };
}

/** Person keys for many contacts in one round trip (MGET), in the order asked. */
export async function getPeople(kv, userId, contactIds) {
  if (!contactIds.length) return [];
  const values = await kv.mget(...contactIds.map(id => personKey(userId, id)));
  return contactIds.map((_, i) => ({ ...emptyPerson(), ...(values?.[i] || {}) }));
}

export async function updatePerson(kv, userId, contactId, mutate) {
  return updateJSON(kv, personKey(userId, contactId), personVersionKey(userId, contactId), async current => {
    const person = { ...emptyPerson(), ...(current || {}) };
    const outcome = await mutate(person);
    if (outcome === null || outcome === undefined) return null;
    return { ...outcome, value: outcome.value ?? person };
  }, { initial: emptyPerson });
}

export function makeTouch({ at, channel, about, direction, source, sourceRef, confidence, inferred }) {
  if (!CHANNELS.includes(channel)) throw bad('bad_channel', `channel must be one of ${CHANNELS.join(', ')}.`);
  if (direction !== undefined && !['in', 'out', 'both'].includes(direction)) throw bad('bad_direction', 'direction must be in, out or both.');
  if (at !== undefined && Number.isNaN(Date.parse(at))) throw bad('bad_date', 'at must be an ISO date.');
  return {
    id: newId('t'), at: iso(at), channel, direction: direction || 'out',
    about: typeof about === 'string' ? about.trim().slice(0, 300) : '',
    source: source || 'manual', sourceRef: sourceRef ?? null,
    confidence: confidence || 'high', inferred: Boolean(inferred),
  };
}

function insertTouch(person, touch) {
  const touches = [touch, ...person.touches].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, TOUCH_CAP);
  return { ...person, touches };
}

// ---------------------------------------------------------------------------
// Threads, mentions, rollup

const live = (t, userId) => t && t.userId === userId && !t.deleted && !t.archived;
const isOpen = t => t.status !== 'done';
export const gateFor = id => String(id ?? '').slice(-4).toUpperCase();

/** A task field names the contact: full name, alias, or a bare first name of three or more letters. */
function fieldNames(value, contact) {
  const v = norm(value);
  if (!v) return false;
  if (contactForms(contact).includes(v)) return true;
  const first = norm(contact.name).split(/\s+/)[0];
  return first.length >= 3 && v === first;
}

function relationFor(task, contact) {
  const personIs = fieldNames(task.person, contact);
  const ownerIs = task.owner && !isMe(task.owner) && fieldNames(task.owner, contact);
  if (personIs && (task.type === 'follow-up' || task.status === 'waiting')) return 'waitingOnThem';
  if (ownerIs) return 'theirs';
  if (personIs && (isMe(task.owner) || !task.owner)) return 'mine';
  return null;
}

/** Open board tasks tied to the contact (theirs / mine / waitingOnThem) plus pinned tasks. */
export function threadsFor(contact, tasks, pinnedTaskIds = [], userId = contact?.userId) {
  const pinned = new Set(pinnedTaskIds);
  const out = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!live(t, userId) || !isOpen(t)) continue;
    const relation = relationFor(t, contact) ?? (pinned.has(t.id) ? 'mine' : null);
    if (!relation) continue;
    out.push({ taskId: t.id, title: t.task ?? '', status: t.status ?? null, dueDate: t.dueDate ?? null, relation, gate: gateFor(t.id), pinned: pinned.has(t.id) });
  }
  out.sort((a, b) => (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : 0);
  return out;
}

/** Task context sentences and titles naming the person, and meetings they attended; newest first, ≤ 20. */
export function mentionsFor(contact, tasks, meetings, userId = contact?.userId) {
  const out = [];
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || t.userId !== userId || t.deleted) continue;
    const text = [t.task, t.context].filter(Boolean).join(' — ');
    if (relationFor(t, contact) || mentionsContact(text, contact)) {
      out.push({ source: 'task', text: (t.context || t.task || '').slice(0, 240), at: t.createdAt || null, ref: t.id });
    }
  }
  for (const m of Array.isArray(meetings) ? meetings : []) {
    if (!m || m.userId !== userId) continue;
    const attended = Array.isArray(m.participants) && m.participants.some(p => contactForms(contact).includes(norm(p)));
    if (attended || mentionsContact(m.title || '', contact)) {
      out.push({ source: 'meeting', text: m.title || '', at: m.date || m.processedAt || null, ref: m.id });
    }
  }
  out.sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  return out.slice(0, MENTION_CAP);
}

/** The numbers the list screen shows. Bands are the client's job; this is only the evidence. */
export function computeRollup(person, { contact, tasks, userId, now = new Date() }) {
  const touches = person.touches || [];
  const firm = touches.filter(t => !t.inferred);
  const last = touches[0] || null;
  const since = ms => touches.filter(t => now - Date.parse(t.at) <= ms).length;
  const threads = contact ? threadsFor(contact, tasks, person.pinnedTaskIds, userId) : [];
  return {
    lastTouchAt: last?.at ?? null,
    lastTouchChannel: last?.channel ?? null,
    lastTouchAbout: last?.about ?? null,
    lastTouchInferred: last ? Boolean(last.inferred) : false,
    lastFirmTouchAt: firm[0]?.at ?? null,
    touches30d: since(30 * DAY_MS),
    touches90d: since(90 * DAY_MS),
    openThreads: threads.length,
    owed: threads.filter(t => t.relation === 'mine').length,
    waitingOn: threads.filter(t => t.relation === 'waitingOnThem').length,
    openSquawks: (person.squawks || []).filter(s => !s.raisedAt).length,
    computedAt: iso(now),
  };
}

/** Recompute and store the rollup for one person; returns the stored rollup. */
export async function refreshRollup(kv, userId, contactId, { contact, tasks, now } = {}) {
  const outcome = await updatePerson(kv, userId, contactId, person => ({ value: { ...person, rollup: computeRollup(person, { contact, tasks, userId, now }) } }));
  return outcome.value.rollup;
}

// ---------------------------------------------------------------------------
// Touches, squawks, pins

export async function addTouch(kv, userId, contactId, touchInput, { contact, tasks } = {}) {
  const touch = makeTouch(touchInput);
  const outcome = await updatePerson(kv, userId, contactId, person => {
    const next = insertTouch(person, touch);
    return { value: { ...next, rollup: computeRollup(next, { contact, tasks, userId }) } };
  });
  return { touch, rollup: outcome.value.rollup };
}

export async function deleteTouch(kv, userId, contactId, touchId, { contact, tasks } = {}) {
  let found = false;
  const outcome = await updatePerson(kv, userId, contactId, person => {
    found = person.touches.some(t => t.id === touchId);
    if (!found) return null;
    const next = { ...person, touches: person.touches.filter(t => t.id !== touchId) };
    return { value: { ...next, rollup: computeRollup(next, { contact, tasks, userId }) } };
  });
  return found ? outcome.value.rollup : null;
}

export async function addSquawk(kv, userId, contactId, { text, type, source }) {
  const clean = typeof text === 'string' ? text.trim().slice(0, 300) : '';
  if (!clean) throw bad('bad_squawk', 'text is required.');
  const kind = type === undefined ? 'raise' : type;
  if (!SQUAWK_TYPES.includes(kind)) throw bad('bad_squawk_type', `type must be one of ${SQUAWK_TYPES.join(', ')}.`);
  const squawk = { id: newId('s'), text: clean, type: kind, createdAt: iso(), raisedAt: null, source: source || 'manual' };
  await updatePerson(kv, userId, contactId, person => {
    const next = { ...person, squawks: [...person.squawks, squawk] };
    return { value: { ...next, rollup: { ...(person.rollup || {}), openSquawks: next.squawks.filter(s => !s.raisedAt).length } } };
  });
  return squawk;
}

export async function patchSquawk(kv, userId, contactId, squawkId, { raisedAt, text }) {
  let updated = null;
  await updatePerson(kv, userId, contactId, person => {
    const i = person.squawks.findIndex(s => s.id === squawkId);
    if (i === -1) return null;
    const s = { ...person.squawks[i] };
    if (raisedAt !== undefined) {
      if (raisedAt !== null && Number.isNaN(Date.parse(raisedAt))) throw bad('bad_date', 'raisedAt must be an ISO date or null.');
      s.raisedAt = raisedAt === null ? null : iso(raisedAt);
    }
    if (text !== undefined) {
      const clean = String(text).trim().slice(0, 300);
      if (!clean) throw bad('bad_squawk', 'text cannot be empty.');
      s.text = clean;
    }
    updated = s;
    const squawks = person.squawks.map(x => x.id === squawkId ? s : x);
    return { value: { ...person, squawks, rollup: { ...(person.rollup || {}), openSquawks: squawks.filter(x => !x.raisedAt).length } } };
  });
  return updated;
}

export async function deleteSquawk(kv, userId, contactId, squawkId) {
  let found = false;
  await updatePerson(kv, userId, contactId, person => {
    found = person.squawks.some(s => s.id === squawkId);
    if (!found) return null;
    const squawks = person.squawks.filter(s => s.id !== squawkId);
    return { value: { ...person, squawks, rollup: { ...(person.rollup || {}), openSquawks: squawks.filter(x => !x.raisedAt).length } } };
  });
  return found;
}

export async function setPin(kv, userId, contactId, taskId, pinned, { contact, tasks } = {}) {
  const outcome = await updatePerson(kv, userId, contactId, person => {
    const ids = new Set(person.pinnedTaskIds);
    if (pinned) ids.add(taskId); else ids.delete(taskId);
    const next = { ...person, pinnedTaskIds: [...ids].slice(0, 100) };
    return { value: { ...next, rollup: computeRollup(next, { contact, tasks, userId }) } };
  });
  return outcome.value.pinnedTaskIds;
}

export async function setMutedSources(kv, userId, contactId, mutedSources) {
  if (!Array.isArray(mutedSources) || mutedSources.some(s => typeof s !== 'string')) throw bad('bad_muted', 'mutedSources must be an array of strings.');
  const outcome = await updatePerson(kv, userId, contactId, person => ({ value: { ...person, mutedSources: [...new Set(mutedSources.map(s => s.trim()).filter(Boolean))].slice(0, 50) } }));
  return outcome.value.mutedSources;
}

// ---------------------------------------------------------------------------
// Review tray (zset)

function parseMember(member) {
  try { return typeof member === 'string' ? JSON.parse(member) : member; } catch { return null; }
}

export async function listReview(kv, userId) {
  const members = (await kv.zrange(reviewKey(userId), 0, REVIEW_CAP - 1)) || [];
  return members.map(parseMember).filter(Boolean);
}

export async function reviewCount(kv, userId) {
  return (await kv.zcard(reviewKey(userId))) ?? 0;
}

async function addReview(kv, userId, item) {
  await kv.zadd(reviewKey(userId), { score: Date.parse(item.at) || Date.now(), member: JSON.stringify(item) });
  await kv.zremrangebyrank(reviewKey(userId), 0, -(REVIEW_CAP + 1));
}

/** Accept (touch for item.contactId or aliasOf) or reject (count; mute the source after 3). */
export async function resolveReview(kv, userId, itemId, { accept, aliasOf, contacts, tasks }) {
  const items = await listReview(kv, userId);
  const item = items.find(i => i.id === itemId);
  if (!item) return null;
  await kv.zrem(reviewKey(userId), JSON.stringify(item));
  if (accept) {
    const contactId = aliasOf || item.contactId;
    const contact = resolveContact(contactId, userContacts(contacts, userId));
    const touch = makeTouch({ at: item.at, channel: item.signal, about: item.text, direction: 'both', source: item.source, sourceRef: item.sourceRef, confidence: 'medium', inferred: false });
    const outcome = await updatePerson(kv, userId, contactId, person => {
      const next = insertTouch(person, touch);
      next.accepted = { ...person.accepted, [item.source]: (person.accepted?.[item.source] || 0) + 1 };
      return { value: { ...next, rollup: computeRollup(next, { contact, tasks, userId }) } };
    });
    return { accepted: true, touch, rollup: outcome.value.rollup };
  }
  const outcome = await updatePerson(kv, userId, item.contactId, person => {
    const rejected = { ...person.rejected, [item.source]: (person.rejected?.[item.source] || 0) + 1 };
    const muted = rejected[item.source] >= MUTE_AFTER_REJECTIONS && !person.mutedSources.includes(item.source)
      ? [...person.mutedSources, item.source] : person.mutedSources;
    return { value: { ...person, rejected, mutedSources: muted } };
  });
  return { accepted: false, mutedSources: outcome.value.mutedSources };
}

// ---------------------------------------------------------------------------
// Signals

/**
 * A feed saw the person. Resolves the name, drops people not on the roster, de-duplicates on sourceRef,
 * then writes a touch (high confidence, or inferred, or a trusted source) or a review item (medium).
 * Returns { outcome: 'touch' | 'review' | 'skipped', reason?, contactId? }. Never throws for bad names.
 */
export async function recordSignal(kv, { userId, contactId, name, at, channel, about, source, sourceRef, confidence = 'medium', inferred = false, direction, excerpt, contacts, roster, tasks }) {
  const all = userContacts(contacts ?? await kv.get('contacts'), userId);
  const contact = resolveContact(contactId ?? name, all);
  if (!contact) return { outcome: 'skipped', reason: 'unresolved' };
  const r = roster ?? await getRoster(kv, userId);
  if (!findEntry(r, contact.id)) return { outcome: 'skipped', reason: 'not_on_roster', contactId: contact.id };
  if (!CHANNELS.includes(channel)) return { outcome: 'skipped', reason: 'bad_channel', contactId: contact.id };

  let decision = null;
  await updatePerson(kv, userId, contact.id, person => {
    if (sourceRef && person.seen.includes(sourceRef)) { decision = { outcome: 'skipped', reason: 'duplicate' }; return null; }
    if (person.mutedSources.includes(source)) { decision = { outcome: 'skipped', reason: 'muted' }; return null; }
    const trusted = confidence === 'high' || inferred || (person.accepted?.[source] || 0) >= AUTO_TRUST_AFTER;
    const seen = sourceRef ? [sourceRef, ...person.seen].slice(0, SEEN_CAP) : person.seen;
    if (trusted) {
      const touch = makeTouch({ at, channel, about, direction: direction || 'both', source, sourceRef, confidence, inferred });
      const next = insertTouch({ ...person, seen }, touch);
      decision = { outcome: 'touch', touch };
      return { value: { ...next, rollup: computeRollup(next, { contact, tasks, userId }) } };
    }
    decision = { outcome: 'review' };
    return { value: { ...person, seen } };
  });
  if (decision.outcome === 'review') {
    const item = { id: newId('r'), contactId: contact.id, signal: channel, at: iso(at), text: about || `${source} saw ${contact.name}`, excerpt: excerpt || '', source, sourceRef: sourceRef ?? null };
    await addReview(kv, userId, item);
    decision.item = item;
  }
  return { ...decision, contactId: contact.id };
}

/**
 * Ingest hook: a meeting was stored. Every roster contact listed in participants, or named at least twice in
 * the title and summary, gets a high-confidence meeting touch (sourceRef = the meeting id, so a day meeting
 * that grows with each capture touches once). Best-effort: callers wrap in try/catch.
 */
export async function recordMeetingSignals(kv, meeting, { userId = meeting?.userId, contacts, roster, tasks } = {}) {
  if (!meeting || !userId) return [];
  const all = userContacts(contacts ?? await kv.get('contacts'), userId);
  const r = roster ?? await getRoster(kv, userId);
  const onRoster = rosterEntries(r).map(e => all.find(c => c.id === e.contactId)).filter(Boolean);
  if (!onRoster.length) return [];
  const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
  const text = `${meeting.title || ''} ${meeting.summary || ''}`;
  const results = [];
  for (const contact of onRoster.slice(0, MAX_ROSTER)) {
    const attended = participants.some(p => resolveContact(p, [contact])?.id === contact.id);
    if (!attended && countMentions(text, contact) < 2) continue;
    results.push(await recordSignal(kv, {
      userId, contactId: contact.id, at: meeting.date && !Number.isNaN(Date.parse(meeting.date)) ? meeting.date : meeting.processedAt,
      channel: 'meeting', about: meeting.title || '', source: 'meeting', sourceRef: `meeting:${meeting.id}`,
      confidence: 'high', direction: 'both', contacts: all, roster: r, tasks,
    }));
  }
  return results;
}

/** Ingest hook: a task became done. Owner or person on the roster gets an inferred work touch. */
export async function recordTaskDone(kv, task, { userId = task?.userId, contacts, roster, tasks } = {}) {
  if (!task || !userId) return [];
  const all = userContacts(contacts ?? await kv.get('contacts'), userId);
  const r = roster ?? await getRoster(kv, userId);
  const names = [task.owner, task.person].filter(n => n && !isMe(n));
  const results = [];
  const done = new Set();
  for (const name of names) {
    const contact = resolveContact(name, all);
    if (!contact || done.has(contact.id)) continue;
    done.add(contact.id);
    results.push(await recordSignal(kv, {
      userId, contactId: contact.id, at: task.updatedAt || new Date().toISOString(), channel: 'work', about: task.task || '',
      source: 'task', sourceRef: `task-done:${task.id}`, confidence: 'medium', inferred: true, direction: 'out', contacts: all, roster: r, tasks,
    }));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Assembly for routes

/** People payload for GET /api/relationships: entries with contact and rollup (rollups recomputed if missing). */
export async function listPeople(kv, userId, { contacts, tasks, now } = {}) {
  const roster = await getRoster(kv, userId);
  const entries = rosterEntries(roster).slice(0, MAX_ROSTER);
  const all = userContacts(contacts ?? await kv.get('contacts'), userId);
  const people = await getPeople(kv, userId, entries.map(e => e.contactId));
  let taskList = tasks;
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const contact = all.find(c => c.id === entry.contactId) || null;
    let rollup = people[i].rollup;
    if (!rollup) {
      taskList = taskList ?? (await kv.get('tasks')) ?? [];
      rollup = await refreshRollup(kv, userId, entry.contactId, { contact, tasks: taskList, now });
    }
    out.push({ entry, contact: publicContact(contact) ?? { id: entry.contactId, name: '(unknown contact)', role: '', company: '', relationshipContext: '' }, rollup });
  }
  return { people: out, reviewCount: await reviewCount(kv, userId), updatedAt: roster.updatedAt };
}

export async function rundownFor(kv, userId, contactId, { contacts, tasks, meetings } = {}) {
  const roster = await getRoster(kv, userId);
  const entry = findEntry(roster, contactId);
  if (!entry) return null;
  const all = userContacts(contacts ?? await kv.get('contacts'), userId);
  const contact = all.find(c => c.id === contactId) || null;
  const taskList = tasks ?? (await kv.get('tasks')) ?? [];
  const meetingList = meetings ?? (await kv.get('meetings')) ?? [];
  const person = await getPerson(kv, userId, contactId);
  const rollup = person.rollup ?? computeRollup(person, { contact, tasks: taskList, userId });
  return {
    person: { entry, contact: publicContact(contact), rollup },
    squawks: person.squawks,
    threads: contact ? threadsFor(contact, taskList, person.pinnedTaskIds, userId) : [],
    mentions: contact ? mentionsFor(contact, taskList, meetingList, userId) : [],
    touches: person.touches.slice(0, 10),
    pinnedTaskIds: person.pinnedTaskIds,
    mutedSources: person.mutedSources,
  };
}

/** Wrap a kv so every command is counted; throws once `max` is reached (for the cron budget). */
export function countingKV(kv, max) {
  const counter = { commands: 0 };
  const proxy = new Proxy(kv, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value !== 'function') return value;
      return (...args) => {
        counter.commands++;
        if (counter.commands > max) throw new RelationshipsError(503, 'budget_exhausted', `KV command budget of ${max} exhausted.`);
        return value.apply(target, args);
      };
    },
  });
  return { kv: proxy, counter };
}

/** Daily maintenance for one user: rollups, expired holds, review trim. Bounded by MAX_ROSTER and the kv budget. */
export async function rollupAll(kv, userId, { now = new Date(), deadlineMs = 20_000 } = {}) {
  const started = Date.now();
  const roster = await getRoster(kv, userId);
  const contacts = userContacts(await kv.get('contacts'), userId);
  const tasks = (await kv.get('tasks')) || [];
  const entries = rosterEntries(roster).slice(0, MAX_ROSTER);
  let people = 0, holdsExpired = 0;
  for (const entry of entries) {
    if (Date.now() - started > deadlineMs) break;
    const contact = contacts.find(c => c.id === entry.contactId) || null;
    await refreshRollup(kv, userId, entry.contactId, { contact, tasks, now });
    people++;
  }
  const expired = entries.filter(e => e.holdUntil && Date.parse(e.holdUntil) <= now.getTime());
  if (expired.length) {
    await updateRoster(kv, userId, r => {
      for (const list of LISTS) r[list] = (r[list] || []).map(e => e.holdUntil && Date.parse(e.holdUntil) <= now.getTime() ? { ...e, holdUntil: null } : e);
      return { value: r };
    });
    holdsExpired = expired.length;
  }
  await kv.zremrangebyrank(reviewKey(userId), 0, -(REVIEW_CAP + 1));
  return { people, holdsExpired, ms: Date.now() - started };
}

// Relationships (PRD-14): historical touches for a person who just joined the roster (or on "Rescan").
//
// Everything a feed would have written had the person been on the roster all along, read from what is
// already in KV: meetings (participants / title mentions), the Outlook email archive (address or unique
// name), recent transcripts, and finished tasks. All candidates are gathered first and written in ONE
// person update — the same de-dupe (`seen` by sourceRef) the live feeds use, so a rescan never doubles a
// touch and a later live signal for the same meeting or task is a no-op.
//
// Metered KV: the kv is wrapped in countingKV with a hard command budget and a wall-clock deadline; when
// either runs out the pass stops, writes what it has, and reports `partial: true`. No SCAN anywhere.
import {
  RelationshipsError, TOUCH_CAP, SEEN_CAP,
  userContacts, resolveContact, countMentions, getRoster, findEntry, updatePerson, makeTouch, computeRollup, countingKV,
} from './relationships-store.mjs';
// Same key lib/meeting-store.js uses (not imported: that file is ESM .js and the node test runner cannot load it).
const transcriptKey = id => `meeting:${id}:transcript`;

export const BACKFILL_COMMAND_BUDGET = 600;
export const BACKFILL_DEADLINE_MS = 15_000;
export const MEETING_LOOKBACK_DAYS = 730;
export const TRANSCRIPT_LOOKBACK_DAYS = 90;
export const TRANSCRIPT_READ_CAP = 40;
export const EMAIL_ID_CAP = 1500;
export const EMAIL_MGET_CHUNK = 200;
export const TASK_CAP = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const norm = s => String(s ?? '').trim().toLowerCase();
const isMe = owner => ['me', 'myself', 'i'].includes(norm(owner));
const validDate = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const ms = value => (validDate(value) ? Date.parse(value) : NaN);

/** "Dan Okafor <dan@northwind.com>" | "dan@northwind.com" → "dan@northwind.com". */
export function addressOf(value) {
  const text = String(value ?? '');
  const angled = text.match(/<([^>]+)>/);
  return norm(angled ? angled[1] : text);
}

/** Is the contact on this email, by address (when the contact has one) or by a unique name resolution otherwise? */
export function emailMatches(email, contact, contacts) {
  if (!email) return null;
  const address = norm(contact.email);
  if (address) {
    const parties = [email.sender_email, ...(Array.isArray(email.to) ? email.to : []), ...(Array.isArray(email.cc) ? email.cc : [])].map(addressOf);
    return parties.includes(address) ? 'address' : null;
  }
  const byName = email.sender_name ? resolveContact(email.sender_name, contacts) : null;
  return byName && byName.id === contact.id ? 'name' : null;
}

/** When a task became done: the status→done activity entry's timestamp, else updatedAt, else createdAt. */
export function doneAt(task) {
  const entries = Array.isArray(task.activity) ? task.activity : [];
  const done = entries.filter(a => a && a.field === 'status' && a.newValue === 'done' && validDate(a.timestamp)).sort((a, b) => ms(b.timestamp) - ms(a.timestamp));
  if (done.length) return done[0].timestamp;
  if (validDate(task.updatedAt)) return task.updatedAt;
  if (validDate(task.createdAt)) return task.createdAt;
  return null;
}

function attended(meeting, contact) {
  const participants = Array.isArray(meeting.participants) ? meeting.participants : [];
  return participants.some(p => resolveContact(p, [contact])?.id === contact.id);
}

/**
 * Look back through KV for one roster person and write the touches the feeds would have produced.
 * Returns { touchesAdded, bySource: { meeting, mail, transcript, task }, commands, ms, partial }.
 * Throws RelationshipsError 404 when the contact is not on the roster.
 */
export async function backfillPerson(rawKV, userId, contactId, {
  contacts, tasks, meetings, now = new Date(),
  commandBudget = BACKFILL_COMMAND_BUDGET, deadlineMs = BACKFILL_DEADLINE_MS,
} = {}) {
  const started = Date.now();
  const { kv, counter } = countingKV(rawKV, commandBudget);
  const summary = { touchesAdded: 0, bySource: { meeting: 0, mail: 0, transcript: 0, task: 0 }, commands: 0, ms: 0, partial: false };
  const outOfTime = () => Date.now() - started > deadlineMs;
  const candidates = new Map();   // sourceRef → { touch input, bucket }
  const offer = (bucket, input) => { if (!candidates.has(input.sourceRef)) candidates.set(input.sourceRef, { bucket, input }); };

  try {
    const all = userContacts(contacts ?? await kv.get('contacts'), userId);
    const contact = all.find(c => c.id === contactId);
    const roster = await getRoster(kv, userId);
    if (!contact || !findEntry(roster, contactId)) throw new RelationshipsError(404, 'not_on_roster', 'Not on the roster.');
    const taskList = Array.isArray(tasks) ? tasks : ((await kv.get('tasks')) || []);
    const meetingList = Array.isArray(meetings) ? meetings : ((await kv.get('meetings')) || []);
    const nowMs = now.getTime();

    // 1. Meetings: participant, or named twice in title + summary.
    const mine = meetingList.filter(m => m && m.userId === userId && m.id);
    const matchedMeetings = new Set();
    for (const m of mine) {
      const at = validDate(m.date) ? m.date : m.processedAt;
      if (!validDate(at) || nowMs - ms(at) > MEETING_LOOKBACK_DAYS * DAY_MS) continue;
      if (!attended(m, contact) && countMentions(`${m.title || ''} ${m.summary || ''}`, contact) < 2) continue;
      matchedMeetings.add(m.id);
      offer('meeting', { at, channel: 'meeting', about: m.title || '', direction: 'both', source: 'meeting', sourceRef: `meeting:${m.id}`, confidence: 'high' });
    }

    // 2. Emails: newest 1,500 ids from the by-date index, MGET in chunks; match by address, or by unique name.
    if (!outOfTime()) {
      const ids = (await kv.zrange('emails:by_date', 0, EMAIL_ID_CAP - 1, { rev: true })) || [];
      for (let i = 0; i < ids.length && !outOfTime(); i += EMAIL_MGET_CHUNK) {
        const chunk = ids.slice(i, i + EMAIL_MGET_CHUNK).map(String);
        const emails = await kv.mget(...chunk.map(id => `email:${id}`));
        emails.forEach((email, j) => {
          if (!email || !emailMatches(email, contact, all)) return;
          const at = validDate(email.sent_at) ? email.sent_at : validDate(email.extracted_at) ? email.extracted_at : null;
          if (!at) return;
          offer('mail', { at, channel: 'mail', about: email.subject || '', direction: 'in', source: 'mail', sourceRef: `email:${chunk[j]}`, confidence: 'high' });
        });
      }
    }

    // 3. Transcripts of recent meetings not already matched: one read each, capped.
    if (!outOfTime()) {
      const recent = mine
        .filter(m => !matchedMeetings.has(m.id) && validDate(m.date) && nowMs - ms(m.date) <= TRANSCRIPT_LOOKBACK_DAYS * DAY_MS)
        .sort((a, b) => ms(b.date) - ms(a.date))
        .slice(0, TRANSCRIPT_READ_CAP);
      for (const m of recent) {
        if (outOfTime()) break;
        const stored = await kv.get(transcriptKey(m.id));
        const text = typeof stored === 'string' ? stored : stored?.text;
        if (typeof text !== 'string' || countMentions(text, contact) < 2) continue;
        offer('transcript', { at: m.date, channel: 'meeting', about: m.title || '', direction: 'both', source: 'meeting', sourceRef: `meeting:${m.id}`, confidence: 'high' });
      }
    }

    // 4. Finished tasks for or from them: inferred work touches (half weight on the client).
    const doneTasks = taskList
      .filter(t => t && t.userId === userId && !t.deleted && t.status === 'done')
      .filter(t => [t.owner, t.person].some(n => n && !isMe(n) && resolveContact(n, all)?.id === contact.id))
      .map(t => ({ t, at: doneAt(t) }))
      .filter(x => x.at)
      .sort((a, b) => ms(b.at) - ms(a.at))
      .slice(0, TASK_CAP);
    for (const { t, at } of doneTasks) {
      offer('task', { at, channel: 'work', about: t.task || '', direction: 'out', source: 'task', sourceRef: `task-done:${t.id}`, confidence: 'medium', inferred: true });
    }

    // 5. One write: skip anything already seen, insert the rest newest-first, remember the refs, recompute the rollup.
    if (candidates.size) {
      await updatePerson(kv, userId, contactId, person => {
        const seen = new Set(person.seen);
        const fresh = [...candidates.values()].filter(({ input }) => !seen.has(input.sourceRef));
        if (!fresh.length) return null;
        const touches = fresh.map(({ input }) => makeTouch(input));
        const merged = [...touches, ...person.touches].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, TOUCH_CAP);
        const refs = fresh.map(({ input }) => input.sourceRef);
        const next = { ...person, touches: merged, seen: [...refs, ...person.seen].slice(0, SEEN_CAP) };
        for (const { bucket } of fresh) summary.bySource[bucket]++;
        summary.touchesAdded = fresh.length;
        return { value: { ...next, rollup: computeRollup(next, { contact, tasks: taskList, userId, now }) } };
      });
    }
    if (outOfTime()) summary.partial = true;
  } catch (error) {
    if (error instanceof RelationshipsError && error.code === 'budget_exhausted') summary.partial = true;
    else throw error;
  }
  summary.commands = counter.commands;
  summary.ms = Date.now() - started;
  return summary;
}

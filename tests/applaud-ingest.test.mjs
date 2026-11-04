import test from 'node:test';
import assert from 'node:assert/strict';
import { applaudMeetingDate, applaudDurationLabel, findApplaudDuplicate, applaudMeetingRecord } from '../lib/applaud-ingest.mjs';

const now = new Date('2026-09-08T14:30:00Z');

test('meeting date comes from the recording start, falling back to today', () => {
  assert.equal(applaudMeetingDate(Date.parse('2026-09-08T13:31:10Z'), now), '2026-09-08');
  assert.equal(applaudMeetingDate(undefined, now), '2026-09-08');
  assert.equal(applaudMeetingDate(0, now), '2026-09-08');
});

test('duration label prefers Gemini, else rounds Applaud ms to minutes, else null', () => {
  assert.equal(applaudDurationLabel('45 minutes', 1_895_760), '45 minutes');
  assert.equal(applaudDurationLabel(null, 1_895_760), '32 min');
  assert.equal(applaudDurationLabel(null, 34_000), null);
  assert.equal(applaudDurationLabel(null, undefined), null);
});

test('duplicates match on recording id or on start time (local→cloud id change)', () => {
  const meetings = [
    { id: 'm_1', plaudRecordingId: 'local-1788874270897', plaudStartTimeMs: 1788874270897 },
    { id: 'm_2', plaudRecordingId: 'abc123', plaudStartTimeMs: null },
  ];
  assert.equal(findApplaudDuplicate(meetings, { plaudRecordingId: 'abc123', startTimeMs: 5 })?.id, 'm_2');
  assert.equal(findApplaudDuplicate(meetings, { plaudRecordingId: 'cloud-id-9', startTimeMs: 1788874270897 })?.id, 'm_1');
  assert.equal(findApplaudDuplicate(meetings, { plaudRecordingId: 'new', startTimeMs: 1 }), null);
  assert.equal(findApplaudDuplicate(meetings, { plaudRecordingId: null, startTimeMs: undefined }), null);
});

test('meeting record carries Applaud identity and Gemini metadata, tolerating junk', () => {
  const m = applaudMeetingRecord({
    userId: 'u1', title: '09-08 Product Sync', transcriptText: 'hello world',
    extracted: { meeting: { title: '  Product Sync  ', participants: ['Ana', 7], summary: 'Two things.' } },
    meetingDate: '2026-09-08', plaudRecordingId: 'local-1788874270897', startTimeMs: 1788874270897, durationMs: 1_895_760, now,
  });
  assert.equal(m.id, `m_${now.getTime()}`);
  assert.equal(m.title, 'Product Sync');
  assert.equal(m.sourceFileName, '09-08 Product Sync');
  assert.deepEqual(m.participants, ['Ana']);
  assert.equal(m.duration, '32 min');
  assert.equal(m.source, 'applaud');
  assert.equal(m.plaudRecordingId, 'local-1788874270897');
  assert.equal(m.plaudStartTimeMs, 1788874270897);
  assert.equal(m.transcript, 'hello world');

  const bare = applaudMeetingRecord({ userId: 'u1', title: 'Untitled Recording', transcriptText: 'x', extracted: {}, meetingDate: '2026-09-08', now });
  assert.equal(bare.title, 'Untitled Recording');
  assert.deepEqual(bare.participants, []);
  assert.equal(bare.summary, '');
  assert.equal(bare.plaudRecordingId, null);
  assert.equal(bare.plaudStartTimeMs, null);
});

// --- Re-attribution after a late Teams transcript (Nov 2026) ---
import { namedSpeakers, hasNamedSpeakerGain, attributionEditedByUser, reattributionCandidates, allowedAttributionNames, applyReattribution, REATTRIBUTION_USER } from '../lib/applaud-ingest.mjs';

const ANON = '[00:39] Speaker B: Good morning.\n\n[01:11] Speaker: Hello.\n\n[01:36] SPEAKER_03: I will send the deck.';
const NAMED = '[00:39] Katy Rosner: Good morning.\n\n[01:11] Speaker: Hello.\n\n[01:36] Corey: I will send the deck.\n\n[02:00] Utsav Haldar: And I will book the room.';

test('namedSpeakers ignores generic labels and reads the Applaud line format', () => {
  assert.deepEqual([...namedSpeakers(ANON)], []);
  assert.deepEqual([...namedSpeakers(NAMED)].sort(), ['Corey', 'Katy Rosner', 'Utsav Haldar']);
  assert.deepEqual([...namedSpeakers('Katy Rosner: no timestamp form')], ['Katy Rosner']);
  assert.deepEqual([...namedSpeakers(null)], []);
});

test('hasNamedSpeakerGain is true only when new names appear', () => {
  assert.equal(hasNamedSpeakerGain(ANON, NAMED), true);
  assert.equal(hasNamedSpeakerGain(NAMED, NAMED), false, 'a resend of the same file is not a gain');
  assert.equal(hasNamedSpeakerGain(null, NAMED), true);
  assert.equal(hasNamedSpeakerGain(ANON, ANON + '\n\n[03:00] Speaker C: more anonymous text'), false);
});

test('candidates exclude archived, done and hand-edited tasks', () => {
  const tasks = [
    { id: 't1', meetingId: 'm', status: 'todo' },
    { id: 't2', meetingId: 'm', status: 'done' },
    { id: 't3', meetingId: 'm', status: 'todo', archived: true },
    { id: 't4', meetingId: 'm', status: 'todo', activity: [{ type: 'update', field: 'owner', user: 'Corey' }] },
    { id: 't5', meetingId: 'm', status: 'todo', activity: [{ type: 'update', field: 'owner', user: REATTRIBUTION_USER }] },
    { id: 't6', meetingId: 'm', status: 'todo', activity: [{ type: 'update', field: 'priority', user: 'Corey' }] },
    { id: 't7', meetingId: 'other', status: 'todo' },
  ];
  assert.deepEqual(reattributionCandidates(tasks, 'm').map(t => t.id), ['t1', 't5', 't6']);
  assert.equal(attributionEditedByUser(tasks[3]), true);
  assert.equal(attributionEditedByUser(tasks[4]), false, 'our own earlier re-attribution does not lock the task');
});

test('allowed names: Me/Unassigned, named speakers, participants in both name orders', () => {
  const allowed = allowedAttributionNames(['Rosner, Katy', 'Haldar, Utsav'], NAMED);
  assert.equal(allowed.get('me'), 'Me');
  assert.equal(allowed.get('katy rosner'), 'Katy Rosner');
  assert.equal(allowed.get('rosner, katy'), 'Rosner, Katy');
  assert.equal(allowed.get('corey'), 'Corey');
  assert.equal(allowed.has('someone else'), false);
});

test('applyReattribution changes only candidates, only to allowed names, with an activity entry', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const tasks = [
    { id: 't1', meetingId: 'm', status: 'todo', type: 'action', owner: 'Me', activity: [] },
    { id: 't2', meetingId: 'm', status: 'todo', type: 'follow-up', owner: 'Me', person: 'Speaker B' },
    { id: 't3', meetingId: 'm', status: 'done', type: 'action', owner: 'Me' },
    { id: 't4', meetingId: 'm', status: 'todo', type: 'action', owner: 'Speaker B' },
  ];
  const allowed = allowedAttributionNames(['Rosner, Katy'], NAMED);
  const { tasks: next, changed } = applyReattribution(tasks, {
    meetingId: 'm', allowed, now,
    assignments: [
      { id: 't1', owner: 'Utsav Haldar', person: null },
      { id: 't2', owner: 'Me', person: 'katy rosner' },
      { id: 't3', owner: 'Katy Rosner' },            // done → untouched
      { id: 't4', owner: 'Someone Invented' },        // not allowed → untouched
      { id: 'tX', owner: 'Me' },                      // unknown id → ignored
    ],
  });
  assert.equal(changed, 2);
  assert.equal(next[0].owner, 'Utsav Haldar');
  assert.equal(next[0].activity.at(-1).field, 'owner');
  assert.equal(next[0].activity.at(-1).oldValue, 'Me');
  assert.equal(next[0].activity.at(-1).user, REATTRIBUTION_USER);
  assert.equal(next[0].updatedAt, now.toISOString());
  assert.equal(next[1].owner, 'Me');
  assert.equal(next[1].person, 'Katy Rosner', 'canonical spelling from the allowed set');
  assert.equal(next[2], tasks[2]);
  assert.equal(next[3], tasks[3]);
  assert.deepEqual(applyReattribution(tasks, { meetingId: 'm', allowed, now, assignments: [] }), { tasks, changed: 0 });
});

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

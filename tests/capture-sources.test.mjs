// Source registry: tags, labels and filing rules for captures (lib/capture-sources.mjs), and how they
// flow into the capture identity and the day meeting (lib/capture-idempotency.mjs).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { captureSourceID, captureSourceMeta, dailyMeetingSuffix } from '../lib/capture-sources.mjs';
import { captureIdentity, dailyMeeting, dailyMeetingTitle } from '../lib/capture-idempotency.mjs';

const ID = '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const req = (source, extra = {}) => ({ body: { captureID: ID, localDate: '2026-09-15', ...(source === undefined ? {} : { source }), ...extra }, headers: {} });

describe('capture sources', () => {
  test('the app and Pebble keep their tags and share the Quick captures day meeting', () => {
    assert.deepEqual(captureSourceMeta('watch').tags, ['watch']);
    assert.deepEqual(captureSourceMeta('phone').tags, ['watch']);
    assert.equal(captureSourceMeta('phone').label, 'iPhone capture');
    assert.deepEqual(captureSourceMeta('pebble').tags, ['pebble']);
    assert.equal(captureSourceMeta('pebble').label, 'Pebble capture');
    for (const s of ['watch', 'phone', 'pebble']) assert.equal(dailyMeetingSuffix(s), '');
    assert.equal(captureSourceID(undefined), 'watch');
    assert.equal(captureSourceID('  Watch '), 'watch');
  });

  test('Glimpse is tagged glimpse and filed in its own day meeting', () => {
    const meta = captureSourceMeta('glimpse');
    assert.deepEqual(meta.tags, ['glimpse']);
    assert.equal(meta.label, 'Glimpse capture');
    assert.equal(meta.file, 'Glimpse');
    assert.equal(dailyMeetingSuffix('glimpse'), '_glimpse');
    assert.equal(dailyMeetingTitle('2026-09-15', 'glimpse'), 'Glimpse — Sep 15, 2026');
    assert.equal(dailyMeetingTitle('2026-09-15'), 'Quick captures — Sep 15, 2026');
  });

  test('an unknown source behaves like the app with a descriptive label', () => {
    const meta = captureSourceMeta('shortcuts');
    assert.deepEqual(meta.tags, ['watch']);
    assert.equal(meta.label, 'Capture: shortcuts');
    assert.equal(dailyMeetingSuffix('shortcuts'), '');
    assert.equal(captureSourceID('x'.repeat(60)).length, 40);
  });

  test('the identity carries the source and separates the Glimpse day meeting from the app’s', () => {
    const app = captureIdentity(req(undefined), 'user-1', 'buy milk');
    const pebble = captureIdentity(req('pebble'), 'user-1', 'buy milk');
    const glimpse = captureIdentity(req('glimpse'), 'user-1', 'reply to Nancy');
    assert.equal(app.source, 'watch');
    assert.equal(app.meetingID, pebble.meetingID, 'Pebble memos file with the app');
    assert.match(app.meetingID, /^m_capture_day_[0-9a-f]{16}_2026-09-15$/);
    assert.equal(glimpse.meetingID, `${app.meetingID}_glimpse`);
    assert.equal(glimpse.key, app.key, 'the receipt key depends on the capture id, not the source');
  });

  test('the day meeting record follows the source', () => {
    const glimpse = captureIdentity(req('glimpse'), 'user-1', 'reply to Nancy');
    const m = dailyMeeting(glimpse, { userId: 'user-1', transcript: 'reply to Nancy', captureSource: 'glimpse', parsedBy: 'glimpse-claude' });
    assert.equal(m.title, 'Glimpse — Sep 15, 2026');
    assert.equal(m.sourceFileName, 'Glimpse');
    assert.equal(m.summary, 'Insights Glimpse spotted on screen on Sep 15, 2026.');
    assert.equal(m.captureSource, 'glimpse');
    assert.equal(m.parsedBy, 'glimpse-claude');
    const app = captureIdentity(req(undefined), 'user-1', 'buy milk');
    const a = dailyMeeting(app, { userId: 'user-1', transcript: 'buy milk', captureSource: 'watch' });
    assert.equal(a.title, 'Quick captures — Sep 15, 2026');
    assert.equal(a.sourceFileName, 'Quick Notes');
    assert.equal(a.summary, 'Voice memos captured with Quick Notes on Sep 15, 2026.');
  });
});

// pages/api/applaud-webhook.js
// Receives transcript_ready webhooks from the owner's local Applaud instance and
// extracts action items with Gemini (lib/extract.js) — same pipeline as inbound-email.js.
//
// Auth: HMAC-SHA256 on the raw request body via X-Applaud-Signature header.
// Set APPLAUD_WEBHOOK_SECRET in Vercel to the same value you set in
// Applaud's Settings → Webhook → Signing secret.
//
// Required env vars:
//   GEMINI_API_KEY           — Google Gemini API key
//   INBOUND_EMAIL_USER_ID    — next-auth user ID to attribute tasks to
//   APPLAUD_WEBHOOK_SECRET   — (optional but recommended) shared HMAC secret
//   APPLAUD_ACCEPT_AFTER     — (optional) ISO date; recordings that started before it are skipped
//
// Sep 2026: the Gemini + meeting-building block was accidentally dropped in the v5.8 commit, so every
// transcript 500'd with "meeting is not defined". It now lives in lib/extract.js + lib/applaud-ingest.mjs.

import crypto from 'node:crypto';
import { addMeetingWithTasks, findMatchingMeeting, getMeetings } from '../../lib/meeting-store';
import { extractWithGemini, getKnownPeople, buildTaskRecords } from '../../lib/extract';
import { applaudMeetingDate, applaudMeetingRecord, findApplaudDuplicate } from '../../lib/applaud-ingest.mjs';
import { withIngestAlert, notifyIngestFailure } from '../../lib/alerts';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// Untitled pocket/accidental recordings produce a few words of transcript. There is nothing to
// extract, and asking Gemini for JSON on them fails (500 + alert noise), so acknowledge and skip.
const MIN_TRANSCRIPT_CHARS = 120;

function verifySignature(rawBody, signature, secret) {
  if (!secret) return true; // No secret configured — allow through
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function skipped(res, reason, extra = {}) {
  return res.status(200).json({ ok: true, skipped: true, reason, ...extra });
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Applaud-Signature, X-Applaud-Event');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify HMAC signature
  const secret = (process.env.APPLAUD_WEBHOOK_SECRET || '').trim();
  const signature = req.headers['x-applaud-signature'] || '';
  const rawBody = JSON.stringify(req.body);
  if (!verifySignature(rawBody, signature, secret)) {
    console.error('Applaud webhook: invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { event, recording, content } = req.body || {};

  // Only process transcript_ready events — audio_ready has no transcript yet
  if (event !== 'transcript_ready') return skipped(res, `event=${event}`);

  const transcriptText = typeof content?.transcript_text === 'string' ? content.transcript_text.trim() : '';
  if (!transcriptText) return skipped(res, 'no transcript_text');
  if (transcriptText.length < MIN_TRANSCRIPT_CHARS) {
    console.log(`Applaud webhook: skipping "${recording?.filename}" (${transcriptText.length} chars, too short)`);
    return skipped(res, 'transcript too short', { chars: transcriptText.length });
  }

  const userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) {
    console.error('INBOUND_EMAIL_USER_ID env var not set');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const title = recording?.filename || 'Untitled Recording';
  const startTimeMs = Number(recording?.start_time_ms) || null;
  const durationMs = Number(recording?.duration_ms) || null;
  const meetingDate = applaudMeetingDate(startTimeMs);
  const plaudRecordingId = recording?.id || null;
  const sourceLabel = `Applaud: ${title}`;

  // Recovery guard (Sept 2026): Plaud AutoFlow emails already created meetings for
  // everything up to APPLAUD_ACCEPT_AFTER, so when Applaud replays its backlog we only
  // accept recordings after that date. Unset the env var to accept everything again.
  const acceptAfter = Date.parse(process.env.APPLAUD_ACCEPT_AFTER || '');
  if (!Number.isNaN(acceptAfter) && startTimeMs && startTimeMs < acceptAfter) {
    console.log(`Applaud webhook: skipping "${title}" (${meetingDate} is before APPLAUD_ACCEPT_AFTER)`);
    return skipped(res, 'before APPLAUD_ACCEPT_AFTER', { meetingDate });
  }

  // Idempotency: the same recording must never create two meetings.
  //  1. Same Plaud recording id or start time (Applaud replays / restarts, local-cache → cloud id).
  //  2. Same day + same title as a meeting the Plaud AutoFlow email already created
  //     (email subjects are "[Plaud-AutoFlow] MM-DD <recording title>").
  const allMeetings = await getMeetings();
  const existing = findApplaudDuplicate(allMeetings, { plaudRecordingId, startTimeMs });
  if (existing) {
    console.log(`Applaud webhook: "${title}" already imported as ${existing.id}`);
    return skipped(res, 'duplicate recording', { meeting: { id: existing.id, title: existing.title } });
  }
  const viaEmail = findMatchingMeeting(allMeetings, { title, date: meetingDate, sources: ['email'] });
  if (viaEmail) {
    console.log(`Applaud webhook: "${title}" matches email meeting ${viaEmail.id} (${viaEmail.date}); skipping`);
    return skipped(res, 'already imported via Plaud email', { meeting: { id: viaEmail.id, title: viaEmail.title } });
  }

  console.log(`Applaud webhook: processing "${title}" (${transcriptText.length} chars)`);
  const people = await getKnownPeople(userId);
  let extracted;
  try {
    ({ extracted } = await extractWithGemini(transcriptText, { people }));
  } catch (err) {
    // 502 so Applaud retries (5 s / 30 s / 2 min); the alert tells the owner if all three fail.
    console.error('Applaud webhook: Gemini extraction failed:', err);
    await notifyIngestFailure('applaud-webhook', err, { title, recordingId: plaudRecordingId });
    return res.status(502).json({ error: 'Extraction failed', details: err instanceof Error ? err.message : String(err) });
  }

  // Re-check right before writing: Gemini takes several seconds, and Applaud's poller and
  // replay endpoint can deliver the same recording concurrently. The early check above
  // catches most duplicates; this one closes the race window.
  const raced = findApplaudDuplicate(await getMeetings(), { plaudRecordingId, startTimeMs });
  if (raced) {
    console.log(`Applaud webhook: "${title}" was imported concurrently as ${raced.id}; skipping`);
    return skipped(res, 'duplicate recording (raced)', { meeting: { id: raced.id, title: raced.title } });
  }

  const meeting = applaudMeetingRecord({ userId, title, extracted, transcriptText, meetingDate, plaudRecordingId, startTimeMs, durationMs });
  const newTasks = buildTaskRecords(extracted?.tasks, { userId, meetingId: meeting.id, sourceLabel, createdAt: meeting.processedAt });

  // Transcript is stored in its own key; metadata + tasks are appended to the arrays.
  await addMeetingWithTasks(meeting, newTasks);

  console.log(`Applaud webhook: extracted ${newTasks.length} tasks from "${meeting.title}"`);
  return res.status(200).json({
    ok: true,
    meeting: { id: meeting.id, title: meeting.title },
    taskCount: newTasks.length,
  });
}

export default withIngestAlert('applaud-webhook', handler);

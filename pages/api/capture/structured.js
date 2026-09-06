// pages/api/capture/structured.js
// Structured capture from the Quick Notes iPhone app (PRD-12 Stage B).
// The phone transcribes on-device and, by default, parses tasks on-device with Apple's
// Foundation Model; it posts the transcript plus the parsed tasks here. If `clientParse`
// is missing or `serverParse` is true, we run the shared Gemini extraction instead.
//
// Auth: Authorization: Bearer <token> (see lib/auth.js getBearerUserId).

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { addMeetingWithTasks } from '../../../lib/meeting-store';
import { getKnownPeople, extractWithGemini, buildTaskRecords, localDateOrToday } from '../../../lib/extract';
import { notifyIngestFailure, withIngestAlert } from '../../../lib/alerts';
import { captureIdentity, findCaptureResponse, captureTaskIDs, commitCapture, sendCaptureError } from '../../../lib/capture-idempotency.mjs';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const body = req.body || {};
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });
  const capture = captureIdentity(req, userId, transcript);
  const previous = await findCaptureResponse(kv, capture);
  if (previous) return res.status(200).json(previous);

  const source = typeof body.source === 'string' && body.source ? body.source.slice(0, 40) : 'watch';
  const recordedAt = Number.isFinite(body.recordedAt) ? new Date(body.recordedAt) : new Date();
  // The phone sends its local calendar date; a UTC split of recordedAt is wrong in the evening (US zones).
  const meetingDate = localDateOrToday(body.localDate) === body.localDate ? body.localDate : recordedAt.toISOString().split('T')[0];
  const clientParse = body.clientParse && typeof body.clientParse === 'object' ? body.clientParse : null;
  const wantServer = body.serverParse === true || !clientParse;

  let title, summary, tasks, parsedBy;
  if (wantServer) {
    try {
      const { extracted } = await extractWithGemini(transcript, { people: await getKnownPeople(userId), today: meetingDate });
      title = extracted.meeting?.title; summary = extracted.meeting?.summary || '';
      tasks = extracted.tasks || []; parsedBy = 'server-gemini';
    } catch (e) {
      // Fall back to the client's parse if we have one; otherwise fail loudly.
      if (!clientParse) {
        await notifyIngestFailure('capture-structured', e, { source, chars: transcript.length });
        return res.status(502).json({ error: 'Extraction failed', details: e.message });
      }
      title = clientParse.title; summary = clientParse.summary || ''; tasks = clientParse.tasks || [];
      parsedBy = `${clientParse.engine || 'client'} (server fallback failed)`;
    }
  } else {
    title = clientParse.title; summary = clientParse.summary || '';
    tasks = clientParse.tasks || []; parsedBy = clientParse.engine || 'client';
  }

  const meetingId = capture?.meetingID || `m_${Date.now()}`;
  const sourceLabel = source === 'watch' ? 'Watch capture' : `Capture: ${source}`;
  const meeting = {
    id: meetingId,
    userId,
    title: (typeof title === 'string' && title.trim()) ? title.trim().slice(0, 140) : `${sourceLabel}: ${transcript.slice(0, 60)}`,
    sourceFileName: sourceLabel,
    transcript,
    date: meetingDate,
    duration: Number.isFinite(body.durationMs) ? Math.round(body.durationMs / 1000) : null,
    participants: [],
    summary: typeof summary === 'string' ? summary.slice(0, 2000) : '',
    source: 'quick-capture',
    captureSource: source,
    parsedBy,
    processedAt: new Date().toISOString(),
  };
  const newTasks = captureTaskIDs(capture, buildTaskRecords(tasks, { userId, meetingId, sourceLabel }));
  const response = {
    success: true,
    parsedBy,
    meeting: { id: meetingId, title: meeting.title, summary: meeting.summary, date: meetingDate },
    tasks: newTasks,
    message: `Saved ${newTasks.length} task${newTasks.length === 1 ? '' : 's'}`,
  };
  if (body.dryRun === true) return res.status(200).json({ ...response, dryRun: true });
  if (capture) {
    return res.status(200).json(await commitCapture(kv, capture, { meeting, tasks: newTasks, response }));
  }
  await addMeetingWithTasks(meeting, newTasks);
  console.log(`Structured capture (${parsedBy}): ${newTasks.length} tasks from ${source}`);
  return res.status(200).json(response);
}

export default withIngestAlert('capture-structured', async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    if (sendCaptureError(error, res)) return;
    throw error;
  }
});

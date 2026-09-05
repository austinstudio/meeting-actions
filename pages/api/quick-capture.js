// pages/api/quick-capture.js
// Receives raw text from macOS Quick Action (or any external source),
// runs Gemini AI extraction, and stores meetings + tasks in KV.
// Auth: shared secret via X-Capture-Secret header (no browser session needed).

import { kv } from '@vercel/kv';
import { addMeetingWithTasks } from '../../lib/meeting-store';
import { getKnownPeople, extractWithGemini, buildTaskRecords } from '../../lib/extract';
import { notifyIngestFailure } from '../../lib/alerts';

// KV helpers (same pattern as webhook.js / inbound-email.js)
async function getMeetings() {
  try { return (await kv.get('meetings')) || []; }
  catch (e) { console.error('KV get meetings error:', e); return []; }
}
async function getTasks() {
  try { return (await kv.get('tasks')) || []; }
  catch (e) { console.error('KV get tasks error:', e); return []; }
}
async function saveMeetings(meetings) { await kv.set('meetings', meetings); }
async function saveTasks(tasks) { await kv.set('tasks', tasks); }


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Capture-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify shared secret
  const secret = req.headers['x-capture-secret'];
  if (!secret || secret !== process.env.CAPTURE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Resolve userId from env (same pattern as inbound-email)
  const userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) {
    console.error('INBOUND_EMAIL_USER_ID env var not set');
    return res.status(500).json({ error: 'Server not configured for quick capture' });
  }

  try {
    const { text, source } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const trimmedText = text.trim();
    const sourceLabel = source || 'Quick Capture';

    console.log(`Quick capture: ${trimmedText.length} chars from "${sourceLabel}"`);

    // Gemini extraction (shared with every other ingest path)
    let extracted;
    try {
      ({ extracted } = await extractWithGemini(trimmedText, { people: await getKnownPeople(userId) }));
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      await notifyIngestFailure('quick-capture', 'Failed to parse Gemini extraction results', { source: req.body?.source });
      return res.status(500).json({ error: 'Failed to parse extraction results', details: parseError.message });
    }

    // dryRun: return the extraction without writing anything (used to score the server parser).
    if (req.body?.dryRun === true) {
      return res.status(200).json({ success: true, dryRun: true, meeting: extracted.meeting || null, tasks: extracted.tasks || [] });
    }

    // Store meeting and tasks in KV
    const meetingId = `m_${Date.now()}`;
    const meetingTitle = extracted.meeting?.title || `${sourceLabel}: Captured Text`;
    const meetingDate = new Date().toISOString().split('T')[0];

    const meeting = {
      id: meetingId,
      userId,
      title: meetingTitle,
      sourceFileName: sourceLabel,
      transcript: trimmedText,
      date: meetingDate,
      duration: extracted.meeting?.duration || null,
      participants: extracted.meeting?.participants || [],
      summary: extracted.meeting?.summary || '',
      source: 'quick-capture',
      processedAt: new Date().toISOString()
    };

    const newTasks = buildTaskRecords(extracted.tasks, { userId, meetingId, sourceLabel });

    // Transcript is stored in its own key; metadata + tasks are appended to the arrays.
    await addMeetingWithTasks(meeting, newTasks);

    console.log(`Quick capture: extracted ${newTasks.length} tasks`);

    return res.status(200).json({
      success: true,
      meeting,
      tasks: newTasks,
      message: `Extracted ${newTasks.length} action items from captured text`
    });
  } catch (error) {
    console.error('Quick capture error:', error);
    await notifyIngestFailure('quick-capture', error, { source: req.body?.source, chars: (req.body?.text || '').length });
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

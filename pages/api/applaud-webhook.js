// pages/api/applaud-webhook.js
// Receives transcript_ready webhooks from a local Applaud instance and
// extracts action items using Gemini — same pipeline as quick-capture.js.
//
// Auth: HMAC-SHA256 on the raw request body via X-Applaud-Signature header.
// Set APPLAUD_WEBHOOK_SECRET in Vercel to the same value you set in
// Applaud's Settings → Webhook → Signing secret.
//
// Required env vars:
//   GEMINI_API_KEY           — Google Gemini API key
//   INBOUND_EMAIL_USER_ID    — next-auth user ID to attribute tasks to
//   APPLAUD_WEBHOOK_SECRET   — (optional but recommended) shared HMAC secret

import crypto from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// KV helpers — same pattern as the rest of the app
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

function getExtractionPrompt() {
  return `You are an expert executive assistant skilled at identifying genuine, actionable commitments from various sources. Your job is to extract ONLY real action items — not discussion topics, ideas mentioned in passing, or general observations.

## CONTENT TYPE DETECTION
First, identify what type of content this is:
- **Meeting Transcript**: Conversation between multiple people, often with speaker labels
- **Email**: Has sender/recipient info, subject line, formal structure
- **Notes**: Personal notes, bullet points, informal jottings
- **Document**: Formal document, specifications, requirements
- **Chat/Slack**: Short messages, informal, often threaded

Adapt your extraction based on the content type.

## CRITICAL: What IS an Action Item

An action item MUST have ALL of these characteristics:
1. **Explicit commitment or request**: Someone states they WILL do something, or asks someone to do something
2. **Specific and actionable**: Can be completed and checked off (not vague like "think about X")
3. **Has an owner**: Someone took responsibility or was assigned (stated or clearly implied)
4. **Has a deliverable**: Results in something tangible (email sent, document created, meeting scheduled, decision made)

## Owner Detection Rules:

### For Meeting Transcripts:
- "I'll..." or "I will..." or "Let me..." → Owner is "Me" (the user)
- "Can you..." or "Could you..." → Owner is the person being asked
- "[Name] will..." → Owner is that person
- Speaker labels like "Corey:" or "Speaker B:" help identify who said what

### General:
- "We need to..." with no specific person → Owner is "Me" (assume user responsibility)
- If genuinely unclear, mark as "Unassigned"

## Priority Detection:
- HIGH: Blocking other work, urgent deadline (today, tomorrow, ASAP), explicitly marked urgent/important, client-facing, escalation
- MEDIUM: Has a deadline within 1-2 weeks, important but not blocking
- LOW: Nice to have, no specific deadline, internal cleanup tasks

## Due Date Rules:
- Use specific dates mentioned ("by Friday" → calculate actual date)
- "EOD" or "end of day" → Today's date
- "ASAP" → Tomorrow
- No date mentioned → Estimate based on urgency (HIGH=2 days, MEDIUM=1 week, LOW=2 weeks)
- Today's date is: ${new Date().toISOString().split('T')[0]}

## Task Types (IMPORTANT):
You may ONLY use these two types:
- "action" - for tasks that can be completed independently
- "follow-up" - for tasks requiring contact with another person

DO NOT use "enhancement" or "bug" as types.

Analyze the content and return ONLY valid JSON in this exact format:

{
  "meeting": {
    "title": "Brief, descriptive title based on content",
    "participants": ["Name 1", "Name 2"],
    "summary": "2-3 sentence summary of key points and what action is needed",
    "duration": null
  },
  "tasks": [
    {
      "task": "Clear, actionable description starting with a verb",
      "owner": "Me|PersonName|Unassigned",
      "dueDate": "YYYY-MM-DD",
      "priority": "high|medium|low",
      "type": "action|follow-up",
      "person": "Name of person to follow up with (only if type is follow-up, otherwise null)",
      "context": "Brief context explaining why this task exists (1 sentence)"
    }
  ]
}

IMPORTANT GUIDELINES:
- Quality over quantity: 3 real action items beats 10 questionable ones
- Every task must pass the "Can this be checked off as DONE?" test
- Combine related micro-tasks into one
- If content has no actionable items, return an empty tasks array

CONTENT:
`;
}

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

export default async function handler(req, res) {
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

  const { event, recording, content } = req.body;

  // Only process transcript_ready events — audio_ready has no transcript yet
  if (event !== 'transcript_ready') {
    return res.status(200).json({ ok: true, skipped: true, reason: `event=${event}` });
  }

  const transcriptText = content?.transcript_text;
  if (!transcriptText || !transcriptText.trim()) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'no transcript_text' });
  }

  const userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) {
    console.error('INBOUND_EMAIL_USER_ID env var not set');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const title = recording?.filename || 'Untitled Recording';
  const startTimeMs = recording?.start_time_ms;
  const meetingDate = startTimeMs
    ? new Date(startTimeMs).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  const plaudRecordingId = recording?.id || null;
  const sourceLabel = `Applaud: ${title}`;

  console.log(`Applaud webhook: processing "${title}" (${transcriptText.length} chars)`);

  // Fetch contacts for known people directory
  let glossaryPrompt = '';
  try {
    let people = [];
    const contacts = await kv.get('contacts') || [];
    const userContacts = contacts.filter(c => c.userId === userId && !c.deleted);
    if (userContacts.length > 0) {
      people = userContacts.map(c => ({
        name: c.name, aliases: c.aliases || [], role: c.role || '', team: c.team || ''
      }));
    } else {
      const glossary = await kv.get('glossary') || [];
      people = glossary
        .filter(e => e.userId === userId)
        .map(e => ({ name: e.name, aliases: e.aliases || [], role: e.role || '', team: e.team || '' }));
    }
    if (people.length > 0) {
      const lines = people.map(e => {
        let line = `- ${e.name}`;
        if (e.aliases.length > 0) line += ` (may appear as: ${e.aliases.join(', ')})`;
        if (e.role || e.team) line += ` — ${[e.role, e.team].filter(Boolean).join(', ')}`;
        return line;
      });
      glossaryPrompt = `\n\n## KNOWN PEOPLE DIRECTORY\nUse the correct spelling from this list when names appear in the transcript.\n\n${lines.join('\n')}\n`;
    }
  } catch (e) {
    console.error('Failed to fetch contacts:', e);
  }

  // Run Gemini extraction
  let extracted;
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent(
      getExtractionPrompt() + glossaryPrompt + '\n' + transcriptText
    );
    const responseText = result.response.text();
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');
    extracted = JSON.parse(match[0]);
  } catch (err) {
    console.error('Gemini extraction failed:', err);
    return res.status(500).json({ error: 'Extraction failed', details: err.message });
  }

  // Store meeting and tasks
  const meetingId = `m_${Date.now()}`;
  const meetingTitle = extracted.meeting?.title || title;
  const createdAt = new Date().toISOString();

  const meeting = {
    id: meetingId,
    userId,
    title: meetingTitle,
    sourceFileName: title,
    transcript: transcriptText,
    date: meetingDate,
    duration: extracted.meeting?.duration || null,
    participants: extracted.meeting?.participants || [],
    summary: extracted.meeting?.summary || '',
    plaudRecordingId,
    source: 'applaud',
    processedAt: createdAt,
  };

  const newTasks = (extracted.tasks || []).map((task, i) => ({
    id: `t_${Date.now()}_${i}`,
    userId,
    meetingId,
    task: task.task,
    owner: task.owner || 'Me',
    dueDate: task.dueDate,
    status: 'uncategorized',
    type: task.type || 'action',
    priority: task.priority || 'medium',
    person: task.person || null,
    context: task.context || null,
    createdAt,
    activity: [{
      id: `act_${Date.now()}_${i}`,
      type: 'created',
      source: sourceLabel,
      meetingId,
      timestamp: createdAt,
    }],
  }));

  let meetings = await getMeetings();
  let tasks = await getTasks();
  meetings.unshift(meeting);
  tasks = [...newTasks, ...tasks];
  meetings = meetings.slice(0, 100);
  tasks = tasks.slice(0, 500);
  await saveMeetings(meetings);
  await saveTasks(tasks);

  console.log(`Applaud webhook: extracted ${newTasks.length} tasks from "${meetingTitle}"`);
  return res.status(200).json({
    ok: true,
    meeting: { id: meetingId, title: meetingTitle },
    taskCount: newTasks.length,
  });
}

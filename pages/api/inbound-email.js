// pages/api/inbound-email.js
// Receives parsed email data from the Cloudflare Email Worker,
// extracts text from attachments (PDF/TXT) or email body,
// runs Gemini extraction, and stores meetings + tasks in KV.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { extractText } from 'unpdf';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

// KV helpers (same pattern as webhook.js)
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

// Extraction prompt — same as webhook.js
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

## Examples by Content Type:

### From Meeting Transcripts:
- "I'll send you the report by Friday" → Action: Send report, Owner: speaker, Due: Friday
- "Can you set up a meeting with the design team?" → Action: Schedule design team meeting, Owner: person asked

### From Emails:
- "Please review the attached proposal and send feedback by EOD" → Action: Review proposal and send feedback, Owner: Me (recipient), Due: End of day
- "I'll have the updated designs to you by Tuesday" → Action: (track) Receive updated designs, Owner: Me, Type: follow-up, Person: sender
- "Can you loop in Sarah on this thread?" → Action: Add Sarah to email thread, Owner: Me
- "Let's schedule a call next week to discuss" → Action: Schedule call with [sender], Owner: Me

### From Notes:
- "TODO: Update project timeline" → Action: Update project timeline, Owner: Me
- "Ask John about API access" → Action: Ask John about API access, Owner: Me, Type: follow-up
- "Need to book travel for conference" → Action: Book travel for conference, Owner: Me

## Examples of what is NOT an Action Item (DO NOT EXTRACT):
- "We should think about redesigning the dashboard" → Just an idea, no commitment
- "The authentication flow needs work" → Observation, not a commitment
- "It would be nice to have better reporting" → Wish, not an action
- "Thanks for the update" → Pleasantry, not action
- "Sounds good!" → Acknowledgment, not action
- "FYI - the meeting was moved to 3pm" → Informational only
- "The team is concerned about deadlines" → Sentiment, not action

## Owner Detection Rules:

### For Meeting Transcripts:
- "I'll..." or "I will..." or "Let me..." → Owner is "Me" (the user)
- "Can you..." or "Could you..." → Owner is the person being asked
- "[Name] will..." → Owner is that person

### For Emails (assume user is the recipient):
- Requests directed at "you" → Owner is "Me"
- Sender commits to doing something → Owner is sender's name, Type: follow-up (you're tracking it)
- CC'd requests → Owner is the person addressed, or "Me" if unclear

### For Notes:
- Most items → Owner is "Me" unless explicitly delegated

### General:
- "We need to..." with no specific person → Owner is "Me" (assume user responsibility)
- If genuinely unclear, mark as "Unassigned"

## Priority Detection:
- HIGH: Blocking other work, urgent deadline (today, tomorrow, ASAP), explicitly marked urgent/important, client-facing, escalation
- MEDIUM: Has a deadline within 1-2 weeks, important but not blocking
- LOW: Nice to have, no specific deadline, internal cleanup tasks, FYI items that need action

## Due Date Rules:
- Use specific dates mentioned ("by Friday" → calculate actual date)
- "EOD" or "end of day" → Today's date
- "End of week" or "EOW" → Friday of current week
- "Next week" → Following Monday
- "End of month" or "EOM" → Last day of current month
- "ASAP" → Tomorrow
- No date mentioned → Estimate based on urgency (HIGH=2 days, MEDIUM=1 week, LOW=2 weeks)
- Today's date is: ${new Date().toISOString().split('T')[0]}

## Follow-up vs Action:
- FOLLOW-UP: Requires contacting or waiting on a specific person ("check with Sarah", "waiting for John's response", "need approval from manager")
- ACTION: Task you can complete independently ("review document", "write proposal", "update spreadsheet")

## Task Types (IMPORTANT):
You may ONLY use these two types in your output:
- "action" - for tasks that can be completed independently
- "follow-up" - for tasks requiring contact with another person

DO NOT use "enhancement" or "bug" as types - these are reserved for manual entry only and should never be auto-extracted.

Analyze the content and return ONLY valid JSON in this exact format:

{
  "meeting": {
    "title": "Brief, descriptive title based on content (e.g., 'Email: Q1 Budget Review' or 'Sprint Planning - Auth Feature')",
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
- Quality over quantity: It's better to extract 3 real action items than 10 questionable ones
- When in doubt, leave it out
- Every task must pass the "Can this be checked off as DONE?" test
- For emails: Focus on what YOU (the recipient) need to do, not what others committed to (unless tracking)
- Combine related micro-tasks into one
- If content has no actionable items, return an empty tasks array

CONTENT:
`;
}

// Extract text content from an attachment
async function extractAttachmentText(attachment) {
  if (!attachment.content) return null;

  const buffer = Buffer.from(attachment.content, 'base64');
  const filename = (attachment.filename || '').toLowerCase();
  const mimeType = (attachment.mimeType || '').toLowerCase();

  if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) {
    try {
      const { text } = await extractText(buffer);
      return text;
    } catch (e) {
      console.error('PDF parse error for', attachment.filename, e);
      return null;
    }
  }

  if (mimeType.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md') || filename.endsWith('.csv')) {
    return buffer.toString('utf-8');
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Email-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify shared secret
  const secret = req.headers['x-email-secret'];
  if (!secret || secret !== process.env.INBOUND_EMAIL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Resolve userId — env var or mapped from sender email
  const userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) {
    console.error('INBOUND_EMAIL_USER_ID env var not set');
    return res.status(500).json({ error: 'Server not configured for email import' });
  }

  try {
    const { from, to, subject, date, text, html, attachments } = req.body;

    if (!from) {
      return res.status(400).json({ error: 'Missing required field: from' });
    }

    console.log(`Inbound email from ${from}: "${subject}" (${attachments?.length || 0} attachments)`);

    // 1. Extract text from attachments (PDF, TXT, etc.)
    let attachmentTexts = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        const extracted = await extractAttachmentText(att);
        if (extracted && extracted.trim()) {
          attachmentTexts.push({ filename: att.filename, text: extracted.trim() });
        }
      }
    }

    // 2. Build the content to send to Gemini
    //    Priority: attachment text > email body text > HTML stripped
    let contentForExtraction = '';

    if (attachmentTexts.length > 0) {
      // Use attachment content as the primary transcript
      contentForExtraction = attachmentTexts
        .map(a => `--- Attachment: ${a.filename} ---\n${a.text}`)
        .join('\n\n');
      // Also include email body for context
      if (text && text.trim()) {
        contentForExtraction = `--- Email Body ---\nFrom: ${from}\nSubject: ${subject}\n\n${text.trim()}\n\n${contentForExtraction}`;
      }
    } else if (text && text.trim()) {
      // No attachments — use email body
      contentForExtraction = `From: ${from}\nTo: ${to}\nSubject: ${subject}\nDate: ${date}\n\n${text.trim()}`;
    } else if (html) {
      // Fallback: strip HTML tags for plain text
      const stripped = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped) {
        contentForExtraction = `From: ${from}\nTo: ${to}\nSubject: ${subject}\nDate: ${date}\n\n${stripped}`;
      }
    }

    if (!contentForExtraction) {
      return res.status(200).json({ success: true, message: 'Email received but no extractable content found', tasks: [] });
    }

    // 3. Fetch contacts for known people directory (same as webhook.js)
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
        const glossaryEntries = await kv.get('glossary') || [];
        const userGlossary = glossaryEntries.filter(e => e.userId === userId);
        people = userGlossary.map(e => ({
          name: e.name, aliases: e.aliases || [], role: e.role || '', team: e.team || ''
        }));
      }
      if (people.length > 0) {
        const lines = people.map(e => {
          let line = `- ${e.name}`;
          if (e.aliases.length > 0) line += ` (may appear as: ${e.aliases.join(', ')})`;
          if (e.role || e.team) line += ` — ${[e.role, e.team].filter(Boolean).join(', ')}`;
          return line;
        });
        glossaryPrompt = `\n\n## KNOWN PEOPLE DIRECTORY\nThe following people are known contacts. When a name in the transcript sounds similar to one of these, use the CORRECT spelling from this list.\n\n${lines.join('\n')}\n`;
      }
    } catch (e) {
      console.error('Failed to fetch contacts/glossary:', e);
    }

    // 4. Call Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-latest' });
    const result = await model.generateContent(getExtractionPrompt() + glossaryPrompt + '\n' + contentForExtraction);
    const response = await result.response;
    const responseText = response.text();

    let extracted;
    try {
      let cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', responseText);
      return res.status(500).json({ error: 'Failed to parse extraction results', raw: responseText });
    }

    // 5. Store meeting and tasks in KV
    const meetingId = `m_${Date.now()}`;
    const meetingTitle = extracted.meeting?.title || `Email: ${subject}`;
    const meetingDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const sourceLabel = `Email: ${subject}`;

    const meeting = {
      id: meetingId,
      userId,
      title: meetingTitle,
      sourceFileName: sourceLabel,
      transcript: contentForExtraction,
      date: meetingDate,
      duration: extracted.meeting?.duration || null,
      participants: extracted.meeting?.participants || [from],
      summary: extracted.meeting?.summary || '',
      source: 'email',
      emailFrom: from,
      emailTo: to,
      processedAt: new Date().toISOString()
    };

    const createdAt = new Date().toISOString();
    const newTasks = (extracted.tasks || []).map((task, index) => ({
      id: `t_${Date.now()}_${index}`,
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
        id: `act_${Date.now()}_${index}`,
        type: 'created',
        source: sourceLabel,
        meetingId,
        timestamp: createdAt
      }]
    }));

    let meetings = await getMeetings();
    let tasks = await getTasks();

    meetings.unshift(meeting);
    tasks = [...newTasks, ...tasks];

    meetings = meetings.slice(0, 100);
    tasks = tasks.slice(0, 500);

    await saveMeetings(meetings);
    await saveTasks(tasks);

    console.log(`Email import: extracted ${newTasks.length} tasks from "${subject}"`);

    return res.status(200).json({
      success: true,
      meeting,
      tasks: newTasks,
      message: `Extracted ${newTasks.length} action items from email`
    });
  } catch (error) {
    console.error('Inbound email processing error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

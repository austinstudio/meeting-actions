// lib/extract.js
// Shared Gemini extraction for every ingest path (quick-capture, Plaud webhook, inbound
// email, Applaud, structured capture). One copy of the prompt, one people-directory
// builder, one task-record mapper. Keep this the only place that knows the prompt.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
export const GEMINI_MODEL = 'gemini-flash-latest';

/** Accepts a client-supplied local calendar date (YYYY-MM-DD); falls back to the server's UTC date. */
export function localDateOrToday(value) {
  return (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : new Date().toISOString().split('T')[0];
}

/** Today's date in an IANA time zone (falls back to UTC when the zone is invalid). */
export function todayInTimeZone(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch { return new Date().toISOString().split('T')[0]; }
}

export function getExtractionPrompt(today = new Date().toISOString().split('T')[0]) {
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
- Today's date is: ${today}

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

/** Known people for the user: contacts first, glossary as fallback. Returns [{name, aliases, role, team}]. */
export async function getKnownPeople(userId) {
  try {
    const contacts = (await kv.get('contacts')) || [];
    const mine = contacts.filter(c => c.userId === userId && !c.deleted);
    if (mine.length > 0) {
      return mine.map(c => ({ name: c.name, aliases: c.aliases || [], role: c.role || '', team: c.team || '' }));
    }
    const glossary = (await kv.get('glossary')) || [];
    return glossary.filter(e => e.userId === userId)
      .map(e => ({ name: e.name, aliases: e.aliases || [], role: e.role || '', team: e.team || '' }));
  } catch (e) {
    console.error('getKnownPeople failed:', e);
    return [];
  }
}

/** Prompt block appended after the extraction prompt so misheard names get the right spelling. */
export function peopleDirectoryPrompt(people) {
  if (!people || people.length === 0) return '';
  const lines = people.map(e => {
    let line = `- ${e.name}`;
    if (e.aliases && e.aliases.length > 0) line += ` (may appear as: ${e.aliases.join(', ')})`;
    if (e.role || e.team) line += ` — ${[e.role, e.team].filter(Boolean).join(', ')}`;
    return line;
  });
  return `\n\n## KNOWN PEOPLE DIRECTORY\nThe following people are known contacts. When a name in the content sounds similar to one of these, use the CORRECT spelling from this list.\n\n${lines.join('\n')}\n`;
}

/**
 * Run Gemini extraction over free text. Returns { extracted, raw }.
 * Throws Error('No JSON found in response') when the model output can't be parsed.
 */
export async function extractWithGemini(text, { people = [], today } = {}) {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(getExtractionPrompt(today) + peopleDirectoryPrompt(people) + '\n' + text);
  const raw = (await result.response).text();
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  return { extracted: JSON.parse(jsonMatch[0]), raw };
}

const VALID_PRIORITY = new Set(['high', 'medium', 'low']);
const VALID_TYPE = new Set(['action', 'follow-up', 'enhancement', 'bug']);

/**
 * Map extracted tasks (from Gemini or from the phone's on-device parser) to Task records.
 * Every field is validated; nothing is trusted from the model.
 */
export function buildTaskRecords(tasks, { userId, meetingId, sourceLabel, tags = [], createdAt = new Date().toISOString(), defaultStatus = 'uncategorized' }) {
  const stamp = Date.now();
  return (tasks || [])
    .filter(t => t && typeof t.task === 'string' && t.task.trim())
    .slice(0, 20)
    .map((t, index) => ({
      id: `t_${stamp}_${index}`,
      userId,
      meetingId,
      tags: Array.isArray(tags) ? [...tags] : [],
      task: String(t.task).trim().slice(0, 300),
      owner: (typeof t.owner === 'string' && t.owner.trim()) ? t.owner.trim().slice(0, 80) : 'Me',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : null,
      status: defaultStatus,
      type: VALID_TYPE.has(t.type) ? t.type : (t.type === 'followUp' ? 'follow-up' : 'action'),
      priority: VALID_PRIORITY.has(t.priority) ? t.priority : 'medium',
      person: (typeof t.person === 'string' && t.person.trim()) ? t.person.trim().slice(0, 80) : null,
      context: (typeof t.context === 'string' && t.context.trim()) ? t.context.trim().slice(0, 500) : null,
      createdAt,
      activity: [{ id: `act_${stamp}_${index}`, type: 'created', source: sourceLabel, meetingId, timestamp: createdAt }],
    }));
}

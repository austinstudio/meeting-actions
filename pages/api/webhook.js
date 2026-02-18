// pages/api/webhook.js
// This endpoint receives Plaud transcripts and extracts action items using Gemini
// Data is persisted in Vercel KV

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper functions for KV storage
async function getMeetings() {
  try {
    const meetings = await kv.get('meetings');
    return meetings || [];
  } catch (e) {
    console.error('KV get meetings error:', e);
    return [];
  }
}

async function getTasks() {
  try {
    const tasks = await kv.get('tasks');
    return tasks || [];
  } catch (e) {
    console.error('KV get tasks error:', e);
    return [];
  }
}

async function saveMeetings(meetings) {
  await kv.set('meetings', meetings);
}

async function saveTasks(tasks) {
  await kv.set('tasks', tasks);
}

// Parse date from title string - handles common formats
function parseDateFromTitle(title) {
  if (!title) return null;

  // Try to find date patterns in the title
  const patterns = [
    // ISO format: 2024-01-15
    /(\d{4}-\d{2}-\d{2})/,
    // US format: 01/15/2024 or 1/15/2024
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    // US format: 01-15-2024
    /(\d{1,2}-\d{1,2}-\d{4})/,
    // Written: January 15, 2024 or Jan 15, 2024
    /((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})/i,
    // Written: 15 January 2024 or 15 Jan 2024
    /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i,
    // Compact: 20240115
    /\b(20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))\b/,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      const dateStr = match[1];
      const parsed = new Date(dateStr);

      // Check if valid date
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }

      // Handle US format MM/DD/YYYY manually
      const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (usMatch) {
        const [, month, day, year] = usMatch;
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }

      // Handle compact format YYYYMMDD
      const compactMatch = dateStr.match(/^(20\d{2})(\d{2})(\d{2})$/);
      if (compactMatch) {
        const [, year, month, day] = compactMatch;
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
    }
  }

  return null;
}

const EXTRACTION_PROMPT = `You are an expert executive assistant skilled at identifying genuine, actionable commitments from various sources. Your job is to extract ONLY real action items — not discussion topics, ideas mentioned in passing, or general observations.

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
    "duration": "estimated duration if mentioned (for meetings), otherwise null"
  },
  "tasks": [
    {
      "task": "Clear, actionable description starting with a verb (e.g., 'Send updated mockups to design team')",
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
- Combine related micro-tasks into one (e.g., don't split "email John" and "attach the file" — just "Send file to John via email")
- If content has no actionable items, return an empty tasks array

CONTENT:
`;

export default async function handler(req, res) {
  // Handle CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Return all meetings and tasks from KV for current user
  if (req.method === 'GET') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const allMeetings = await getMeetings();
    const allTasks = await getTasks();

    // Filter to only return user's own data
    const meetings = allMeetings.filter(m => m.userId === userId);
    const tasks = allTasks.filter(t => t.userId === userId);

    return res.status(200).json({ meetings, tasks });
  }

  // POST - Process new transcript
  if (req.method === 'POST') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { transcript, title, date, noteId } = req.body;

      if (!transcript) {
        return res.status(400).json({ error: 'No transcript provided' });
      }

      console.log('Processing transcript:', title || 'Untitled meeting');

      // Fetch glossary for known people directory
      let glossaryPrompt = '';
      try {
        const glossaryEntries = await kv.get('glossary') || [];
        const userGlossary = glossaryEntries.filter(e => e.userId === userId);
        if (userGlossary.length > 0) {
          const lines = userGlossary.map(e => {
            let line = `- ${e.name}`;
            if (e.aliases.length > 0) {
              line += ` (may appear as: ${e.aliases.join(', ')})`;
            }
            if (e.role || e.team) {
              line += ` — ${[e.role, e.team].filter(Boolean).join(', ')}`;
            }
            return line;
          });
          glossaryPrompt = `\n\n## KNOWN PEOPLE DIRECTORY\nThe following people are known contacts. When a name in the transcript sounds similar to one of these, use the CORRECT spelling from this list. This applies to task owners, participants, and follow-up persons.\n\n${lines.join('\n')}\n`;
        }
      } catch (glossaryError) {
        console.error('Failed to fetch glossary, proceeding without it:', glossaryError);
      }

      // Call Gemini to extract action items
      const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

      const result = await model.generateContent(EXTRACTION_PROMPT + glossaryPrompt + '\n' + transcript);
      const response = await result.response;
      const responseText = response.text();
      
      let extracted;
      
      try {
        // Clean up response - remove markdown code blocks if present
        let cleanedResponse = responseText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        
        // Find JSON in the response
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', responseText);
        return res.status(500).json({ 
          error: 'Failed to parse extraction results',
          raw: responseText 
        });
      }

      // Generate IDs and store the meeting
      const meetingId = `m_${Date.now()}`;
      const meetingTitle = extracted.meeting.title || title || 'Untitled Meeting';

      // Try to extract date from title first, then fall back to provided date, then today
      const extractedDate = parseDateFromTitle(title) || parseDateFromTitle(meetingTitle);
      const meetingDate = extractedDate || date || new Date().toISOString().split('T')[0];

      const meeting = {
        id: meetingId,
        userId,
        title: meetingTitle,
        sourceFileName: title || null,  // Original filename before AI extraction
        transcript: transcript,          // Store full transcript for context
        date: meetingDate,
        duration: extracted.meeting.duration || null,
        participants: extracted.meeting.participants || [],
        summary: extracted.meeting.summary || '',
        plaudNoteId: noteId,
        processedAt: new Date().toISOString()
      };

      // Add tasks with generated IDs and initial activity entry
      const createdAt = new Date().toISOString();
      const sourceLabel = title || meetingTitle;
      const newTasks = (extracted.tasks || []).map((task, index) => ({
        id: `t_${Date.now()}_${index}`,
        userId,
        meetingId: meetingId,
        task: task.task,
        owner: task.owner || 'Me',
        dueDate: task.dueDate,
        status: 'uncategorized',
        type: task.type || 'action',
        priority: task.priority || 'medium',
        person: task.person || null,
        context: task.context || null,
        createdAt: createdAt,
        activity: [{
          id: `act_${Date.now()}_${index}`,
          type: 'created',
          source: sourceLabel,
          meetingId: meetingId,
          timestamp: createdAt
        }]
      }));

      // Get existing data from KV
      let meetings = await getMeetings();
      let tasks = await getTasks();

      // Add new data
      meetings.unshift(meeting);
      tasks = [...newTasks, ...tasks];

      // Keep only last 100 meetings and 500 tasks
      meetings = meetings.slice(0, 100);
      tasks = tasks.slice(0, 500);

      // Save to KV
      await saveMeetings(meetings);
      await saveTasks(tasks);

      console.log(`Extracted ${newTasks.length} tasks from meeting: ${meeting.title}`);

      return res.status(200).json({
        success: true,
        meeting,
        tasks: newTasks,
        message: `Extracted ${newTasks.length} action items`
      });

    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(500).json({ 
        error: 'Failed to process transcript',
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

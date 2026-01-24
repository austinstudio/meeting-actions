// pages/api/webhook.js
// This endpoint receives Plaud transcripts and extracts action items using Gemini
// Data is persisted in Vercel KV

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';

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

const EXTRACTION_PROMPT = `You are an expert executive assistant skilled at identifying genuine, actionable commitments from meeting transcripts. Your job is to extract ONLY real action items — not discussion topics, ideas mentioned in passing, or general observations.

## CRITICAL: What IS an Action Item

An action item MUST have ALL of these characteristics:
1. **Explicit commitment**: Someone clearly states they WILL do something (not "should" or "could" or "might")
2. **Specific and actionable**: Can be completed and checked off (not vague like "think about X")
3. **Has an owner**: Someone took responsibility (stated or clearly implied)
4. **Has a deliverable**: Results in something tangible (email sent, document created, meeting scheduled, decision made)

## Examples of REAL Action Items:
- "I'll send you the report by Friday" → Action: Send report, Owner: speaker, Due: Friday
- "Can you set up a meeting with the design team?" → Action: Schedule design team meeting, Owner: person asked
- "Let me follow up with Sarah on the budget numbers" → Action: Follow up with Sarah re: budget, Owner: speaker
- "I need to review the wireframes before dev starts" → Action: Review wireframes, Owner: speaker
- "We should loop in legal — I'll reach out to them" → Action: Contact legal team, Owner: speaker

## Examples of what is NOT an Action Item (DO NOT EXTRACT):
- "We should think about redesigning the dashboard" → Just an idea, no commitment
- "The authentication flow needs work" → Observation, not a commitment
- "It would be nice to have better reporting" → Wish, not an action
- "Let's discuss this more next week" → Vague, no specific action
- "That's a good point about the timeline" → Commentary
- "We talked about the Q3 roadmap" → Summary of discussion, not action
- "The team is concerned about deadlines" → Sentiment, not action
- "Maybe we could try a different approach" → Speculation

## Owner Detection Rules:
- "I'll..." or "I will..." or "Let me..." → Owner is "Me" (the user)
- "Can you..." or "Could you..." or "[Name], please..." → Owner is the person being asked
- "We need to..." with no specific person → Owner is "Me" (assume user responsibility)
- "[Name] will..." or "[Name] is going to..." → Owner is that person
- If genuinely unclear, mark as "Unassigned"

## Priority Detection:
- HIGH: Blocking other work, has urgent deadline (today, tomorrow, ASAP), explicitly marked urgent, client-facing
- MEDIUM: Has a deadline within 1-2 weeks, important but not blocking
- LOW: Nice to have, no specific deadline, internal cleanup tasks

## Due Date Rules:
- Use specific dates mentioned ("by Friday" → calculate actual date)
- "End of week" → Friday of current week
- "Next week" → Following Monday
- "End of month" → Last day of current month
- No date mentioned → Estimate based on urgency (HIGH=2 days, MEDIUM=1 week, LOW=2 weeks)
- Today's date is: ${new Date().toISOString().split('T')[0]}

## Follow-up vs Action:
- FOLLOW-UP: Requires contacting or waiting on a specific person ("check with Sarah", "ping the dev team", "get approval from John")
- ACTION: Task you can complete independently ("review document", "write proposal", "update spreadsheet")

Analyze the transcript and return ONLY valid JSON in this exact format:

{
  "meeting": {
    "title": "Brief, descriptive title (e.g., 'Sprint Planning - Auth Feature' not just 'Meeting')",
    "participants": ["Name 1", "Name 2"],
    "summary": "2-3 sentence summary of key decisions and outcomes",
    "duration": "estimated duration if mentioned, otherwise null"
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
- Do not extract tasks that are someone else's responsibility unless the user needs to track them
- Combine related micro-tasks into one (e.g., don't split "email John" and "attach the file" — just "Send file to John via email")

TRANSCRIPT:
`;

export default async function handler(req, res) {
  // Handle CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Return all meetings and tasks from KV
  if (req.method === 'GET') {
    const meetings = await getMeetings();
    const tasks = await getTasks();
    return res.status(200).json({ meetings, tasks });
  }

  // POST - Process new transcript
  if (req.method === 'POST') {
    try {
      const { transcript, title, date, noteId } = req.body;

      if (!transcript) {
        return res.status(400).json({ error: 'No transcript provided' });
      }

      console.log('Processing transcript:', title || 'Untitled meeting');

      // Call Gemini to extract action items
      const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
      
      const result = await model.generateContent(EXTRACTION_PROMPT + transcript);
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
      const meeting = {
        id: meetingId,
        title: extracted.meeting.title || title || 'Untitled Meeting',
        date: date || new Date().toISOString().split('T')[0],
        duration: extracted.meeting.duration || null,
        participants: extracted.meeting.participants || [],
        summary: extracted.meeting.summary || '',
        plaudNoteId: noteId,
        processedAt: new Date().toISOString()
      };

      // Add tasks with generated IDs
      const newTasks = (extracted.tasks || []).map((task, index) => ({
        id: `t_${Date.now()}_${index}`,
        meetingId: meetingId,
        task: task.task,
        owner: task.owner || 'Me',
        dueDate: task.dueDate,
        status: 'todo',
        type: task.type || 'action',
        priority: task.priority || 'medium',
        person: task.person || null,
        context: task.context || null,
        createdAt: new Date().toISOString()
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

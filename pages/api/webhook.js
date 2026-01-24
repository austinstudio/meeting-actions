// pages/api/webhook.js
// This endpoint receives Plaud transcripts from Zapier and extracts action items using Gemini

import { GoogleGenerativeAI } from '@google/generative-ai';

// In-memory storage for demo (replace with database in production)
// Vercel KV, Supabase, or Planetscale would be good options
let meetings = [];
let tasks = [];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const EXTRACTION_PROMPT = `You are an expert at extracting actionable items from meeting transcripts. 

Analyze the following meeting transcript and extract:
1. Meeting metadata (title, participants mentioned, brief summary)
2. Action items - specific tasks that need to be completed
3. Follow-ups - people who need to be contacted or followed up with

For each task, determine:
- The specific task description (be concise but clear)
- Who owns it (if unclear, assume "Me")
- Suggested due date (use reasonable estimates based on urgency implied)
- Priority (high/medium/low based on context)
- Type: "action" for tasks, "follow-up" for people to contact

Return ONLY valid JSON in this exact format:
{
  "meeting": {
    "title": "Brief descriptive title for the meeting",
    "participants": ["Name 1", "Name 2"],
    "summary": "2-3 sentence summary of what was discussed",
    "duration": "estimated duration if mentioned"
  },
  "tasks": [
    {
      "task": "Clear, actionable description",
      "owner": "Me",
      "dueDate": "YYYY-MM-DD",
      "priority": "high|medium|low",
      "type": "action|follow-up",
      "person": "Name if this is a follow-up, null otherwise",
      "context": "Brief context from the meeting"
    }
  ]
}

Be thorough - capture ALL action items and follow-ups mentioned. If someone says "I'll send you X" or "let's schedule Y" or "we need to Z", those are action items.

Today's date is: ${new Date().toISOString().split('T')[0]}

TRANSCRIPT:
`;

export default async function handler(req, res) {
  // Handle CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Return all meetings and tasks
  if (req.method === 'GET') {
    return res.status(200).json({ meetings, tasks });
  }

  // POST - Process new transcript from Zapier
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
        duration: extracted.meeting.duration || 'Unknown',
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
        context: task.context || null
      }));

      // Store in memory (replace with database calls)
      meetings.unshift(meeting);
      tasks = [...newTasks, ...tasks];

      // Keep only last 50 meetings and 200 tasks in memory
      meetings = meetings.slice(0, 50);
      tasks = tasks.slice(0, 200);

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

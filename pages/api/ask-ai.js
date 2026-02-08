// pages/api/ask-ai.js
// AI Assistant endpoint for conversational queries about tasks and meetings

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';
import { buildContext } from '../../lib/ai-context';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a helpful AI assistant for a task management application called "Meeting Actions". Users import meeting transcripts and you help them extract and manage action items.

You have access to the user's current tasks, meetings, and related data. Use this context to answer their questions helpfully and concisely.

Your capabilities:
- Answer questions about tasks (what's due, who owns what, priorities, etc.)
- Provide summaries and status updates
- Help find specific tasks or meetings
- Offer prioritization suggestions
- Analyze workload and deadlines

IMPORTANT FORMATTING RULES:
1. When listing tasks, use this EXACT format for each task (one per line):
   [[TASK:task_id_here]]

   The task_id is provided in the context as [ID:xxx]. Extract just the ID part.
   Example: If context shows [ID:t_1706789123_0], write [[TASK:t_1706789123_0]]

2. For general text formatting:
   - Use **bold** for emphasis
   - Use bullet points with "• " (bullet character) for lists that aren't tasks
   - Keep paragraphs short and scannable
   - Use line breaks between sections

3. Structure your responses clearly:
   - Start with a brief summary or direct answer
   - Then list relevant tasks using the [[TASK:id]] format
   - End with any suggestions or next steps if appropriate

4. Date formatting: Use human-friendly formats like "tomorrow", "Monday", "Jan 15"

5. Do NOT include task details in your text - just use [[TASK:id]] and the UI will render the full task card

Example response format:
You have 3 tasks due this week:

[[TASK:t_123_0]]
[[TASK:t_123_1]]
[[TASK:t_123_2]]

I'd suggest prioritizing the first one since it's **high priority** and due tomorrow.

Current user context:
`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'No message provided' });
    }

    // Fetch user's data
    const allTasks = await kv.get('tasks') || [];
    const allMeetings = await kv.get('meetings') || [];

    const userTasks = allTasks.filter(t => t.userId === userId);
    const userMeetings = allMeetings.filter(m => m.userId === userId);

    // Build context
    const { context, tasks, meetings } = buildContext(userTasks, userMeetings);

    // Initialize the model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Build conversation history for multi-turn
    const chatHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Start chat with system context
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: SYSTEM_PROMPT + context + '\n\nPlease acknowledge you understand your role and have access to my task data.' }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand. I\'m your Meeting Actions assistant with access to your tasks and meetings. I can help you query your tasks, get status updates, find specific items, and suggest priorities. What would you like to know?' }]
        },
        ...chatHistory
      ]
    });

    // Send the user's message
    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    // Extract referenced task IDs from response
    const taskIdMatches = text.match(/\[\[TASK:([\w_]+)\]\]/g) || [];
    const referencedTaskIds = taskIdMatches.map(m => m.match(/\[\[TASK:([\w_]+)\]\]/)[1]);

    // Get the full task objects for referenced tasks
    const referencedTasks = tasks.filter(t => referencedTaskIds.includes(t.id));

    // Also include meeting info for those tasks
    const taskMeetings = {};
    referencedTasks.forEach(t => {
      if (t.meetingId) {
        const meeting = meetings.find(m => m.id === t.meetingId);
        if (meeting) {
          taskMeetings[t.meetingId] = { id: meeting.id, title: meeting.title };
        }
      }
    });

    return res.status(200).json({
      success: true,
      response: text,
      tasks: referencedTasks,
      meetings: taskMeetings
    });

  } catch (error) {
    console.error('Ask AI error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
}

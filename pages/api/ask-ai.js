// pages/api/ask-ai.js
// AI Assistant endpoint for conversational queries about tasks and meetings

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Build context about user's tasks and meetings
function buildContext(tasks, meetings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeTasks = tasks.filter(t => !t.deleted && !t.archived);
  const tasksByStatus = {};
  activeTasks.forEach(t => {
    if (!tasksByStatus[t.status]) tasksByStatus[t.status] = [];
    tasksByStatus[t.status].push(t);
  });

  // Calculate some stats
  const overdueTasks = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today && t.status !== 'done';
  });

  const dueTodayTasks = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() === today.getTime() && t.status !== 'done';
  });

  const dueThisWeek = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    return due > today && due <= weekFromNow && t.status !== 'done';
  });

  // Build context string
  let context = `TODAY'S DATE: ${today.toISOString().split('T')[0]}\n\n`;

  context += `TASK SUMMARY:\n`;
  context += `- Total active tasks: ${activeTasks.length}\n`;
  context += `- Overdue: ${overdueTasks.length}\n`;
  context += `- Due today: ${dueTodayTasks.length}\n`;
  context += `- Due this week: ${dueThisWeek.length}\n`;
  context += `- Completed: ${(tasksByStatus['done'] || []).length}\n\n`;

  context += `TASKS BY STATUS:\n`;
  for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
    context += `\n[${status.toUpperCase()}] (${statusTasks.length} tasks):\n`;
    statusTasks.slice(0, 20).forEach(t => {
      const meeting = meetings.find(m => m.id === t.meetingId);
      context += `- "${t.task}" | Owner: ${t.owner} | Due: ${t.dueDate} | Priority: ${t.priority}`;
      if (t.type === 'follow-up' && t.person) context += ` | Follow-up with: ${t.person}`;
      if (meeting) context += ` | From: ${meeting.title}`;
      if (t.tags?.length) context += ` | Tags: ${t.tags.join(', ')}`;
      context += `\n`;
    });
    if (statusTasks.length > 20) {
      context += `  ... and ${statusTasks.length - 20} more\n`;
    }
  }

  context += `\nRECENT MEETINGS (${meetings.length} total):\n`;
  meetings.slice(0, 10).forEach(m => {
    const meetingTasks = activeTasks.filter(t => t.meetingId === m.id);
    context += `- "${m.title}" (${m.date}) - ${meetingTasks.length} tasks`;
    if (m.participants?.length) context += ` | Participants: ${m.participants.join(', ')}`;
    context += `\n`;
  });

  return context;
}

const SYSTEM_PROMPT = `You are a helpful AI assistant for a task management application called "Meeting Actions". Users import meeting transcripts and you help them extract and manage action items.

You have access to the user's current tasks, meetings, and related data. Use this context to answer their questions helpfully and concisely.

Your capabilities:
- Answer questions about tasks (what's due, who owns what, priorities, etc.)
- Provide summaries and status updates
- Help find specific tasks or meetings
- Offer prioritization suggestions
- Analyze workload and deadlines

Guidelines:
- Be concise but helpful - this is a productivity tool
- Use bullet points and clear formatting when listing things
- If asked about something not in the data, say so clearly
- Reference specific task names and dates when relevant
- When suggesting priorities, consider due dates, priority levels, and overdue status
- Format dates in a human-friendly way (e.g., "tomorrow", "next Monday", "Jan 15")

You cannot modify tasks directly (yet), but you can suggest what actions the user should take.

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

    const tasks = allTasks.filter(t => t.userId === userId);
    const meetings = allMeetings.filter(m => m.userId === userId);

    // Build context
    const context = buildContext(tasks, meetings);

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

    return res.status(200).json({
      success: true,
      response: text
    });

  } catch (error) {
    console.error('Ask AI error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
}

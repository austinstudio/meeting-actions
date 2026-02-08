// pages/api/suggestions.js
// AI-powered smart suggestions endpoint

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';
import { buildContext } from '../../lib/ai-context';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SUGGESTIONS_PROMPT = `You are an AI assistant for a task management app. Based on the user's current tasks and meetings, generate exactly 2-3 smart suggestions to help them stay productive.

Each suggestion should be one of these types:
- OVERDUE_REMINDER: Tasks that are past due and need attention
- PRIORITY_RECOMMENDATION: High-priority tasks that should be tackled next
- FOLLOW_UP_NUDGE: Follow-up tasks or tasks that haven't been touched in a while

Respond with ONLY a valid JSON array (no markdown, no code fences). Each object must have:
- "type": one of OVERDUE_REMINDER, PRIORITY_RECOMMENDATION, FOLLOW_UP_NUDGE
- "title": short actionable title (max 50 chars)
- "description": brief explanation of why this matters (max 100 chars)
- "taskIds": array of 1-3 relevant task IDs from the context (use the [ID:xxx] values)
- "priority": "high", "medium", or "low"

Rules:
- Only suggest tasks that are NOT done
- Prioritize overdue tasks first, then high-priority upcoming tasks, then follow-ups
- Be specific - reference actual task names in the title
- If there are no meaningful suggestions, return an empty array []

Example response:
[{"type":"OVERDUE_REMINDER","title":"2 tasks overdue since Monday","description":"Review budget proposal and send client update are past due","taskIds":["t_123_0","t_123_1"],"priority":"high"}]

User context:
`;

function generateFallbackSuggestions(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const suggestions = [];

  const activeTasks = tasks.filter(t => !t.deleted && !t.archived && t.status !== 'done');

  // Check for overdue tasks
  const overdueTasks = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  });

  if (overdueTasks.length > 0) {
    const sorted = overdueTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    suggestions.push({
      type: 'OVERDUE_REMINDER',
      title: overdueTasks.length === 1
        ? `"${sorted[0].task.slice(0, 35)}..." is overdue`
        : `${overdueTasks.length} tasks are overdue`,
      description: overdueTasks.length === 1
        ? `Due ${sorted[0].dueDate}`
        : `Earliest due ${sorted[0].dueDate}`,
      taskIds: sorted.slice(0, 3).map(t => t.id),
      priority: 'high'
    });
  }

  // Check for high-priority tasks
  const highPriority = activeTasks
    .filter(t => t.priority === 'high' && !overdueTasks.includes(t))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (highPriority.length > 0) {
    suggestions.push({
      type: 'PRIORITY_RECOMMENDATION',
      title: highPriority.length === 1
        ? `Focus on "${highPriority[0].task.slice(0, 30)}..."`
        : `${highPriority.length} high-priority tasks need attention`,
      description: `Due ${highPriority[0].dueDate}`,
      taskIds: highPriority.slice(0, 3).map(t => t.id),
      priority: 'high'
    });
  }

  // Check for follow-ups
  const followUps = activeTasks
    .filter(t => t.type === 'follow-up')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (followUps.length > 0 && suggestions.length < 3) {
    suggestions.push({
      type: 'FOLLOW_UP_NUDGE',
      title: followUps.length === 1
        ? `Follow up with ${followUps[0].person || 'team'}`
        : `${followUps.length} follow-ups pending`,
      description: followUps[0].person
        ? `Re: "${followUps[0].task.slice(0, 40)}..."`
        : `Earliest due ${followUps[0].dueDate}`,
      taskIds: followUps.slice(0, 3).map(t => t.id),
      priority: 'medium'
    });
  }

  return suggestions.slice(0, 3);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const allTasks = await kv.get('tasks') || [];
    const allMeetings = await kv.get('meetings') || [];

    const userTasks = allTasks.filter(t => t.userId === userId);
    const userMeetings = allMeetings.filter(m => m.userId === userId);

    // If no tasks, return empty
    const activeTasks = userTasks.filter(t => !t.deleted && !t.archived && t.status !== 'done');
    if (activeTasks.length === 0) {
      return res.status(200).json({ suggestions: [] });
    }

    const { context } = buildContext(userTasks, userMeetings);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(SUGGESTIONS_PROMPT + context);
      const response = await result.response;
      let text = response.text().trim();

      // Strip markdown code fences if present
      if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      const suggestions = JSON.parse(text);

      if (Array.isArray(suggestions)) {
        return res.status(200).json({ suggestions: suggestions.slice(0, 3) });
      }

      // Invalid format, use fallback
      return res.status(200).json({
        suggestions: generateFallbackSuggestions(userTasks)
      });
    } catch (aiError) {
      console.error('AI suggestions error, using fallback:', aiError.message);
      return res.status(200).json({
        suggestions: generateFallbackSuggestions(userTasks)
      });
    }
  } catch (error) {
    console.error('Suggestions error:', error);
    return res.status(500).json({ error: 'Failed to generate suggestions' });
  }
}

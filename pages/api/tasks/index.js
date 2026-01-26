// pages/api/tasks/index.js
// Create new tasks manually (not from transcript)

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { task, owner, person, dueDate, priority, type, context, status } = req.body;

      if (!task) {
        return res.status(400).json({ error: 'Task description is required' });
      }

      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];

      // Create new task
      const newTask = {
        id: `t_${Date.now()}`,
        userId,
        meetingId: null, // Manual task, not from a meeting
        task: task,
        owner: owner || 'Me',
        dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default: 1 week
        status: status || 'todo',
        type: type || 'action',
        priority: priority || 'medium',
        person: person || null,
        context: context || null,
        createdAt: new Date().toISOString(),
        manual: true // Flag to indicate this was manually created
      };
      
      // Add to beginning of tasks array
      tasks.unshift(newTask);
      
      // Keep only last 500 tasks
      tasks = tasks.slice(0, 500);
      
      // Save back to KV
      await kv.set('tasks', tasks);
      
      return res.status(200).json({ 
        success: true, 
        task: newTask
      });
    } catch (error) {
      console.error('Create task error:', error);
      return res.status(500).json({ error: 'Failed to create task' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

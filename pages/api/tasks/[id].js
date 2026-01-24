// pages/api/tasks/[id].js
// Update individual task status with KV persistence

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (req.method === 'PATCH') {
    try {
      const { status, priority } = req.body;
      
      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];
      
      // Find and update the task
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Update fields
      if (status) tasks[taskIndex].status = status;
      if (priority) tasks[taskIndex].priority = priority;
      
      // Save back to KV
      await kv.set('tasks', tasks);
      
      return res.status(200).json({ 
        success: true, 
        task: tasks[taskIndex]
      });
    } catch (error) {
      console.error('Task update error:', error);
      return res.status(500).json({ error: 'Failed to update task' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];
      
      // Remove the task
      tasks = tasks.filter(t => t.id !== id);
      
      // Save back to KV
      await kv.set('tasks', tasks);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Task delete error:', error);
      return res.status(500).json({ error: 'Failed to delete task' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

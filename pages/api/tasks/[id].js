// pages/api/tasks/[id].js
// Update, archive, or delete individual tasks

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
      const { status, priority, archived, column, task, owner, person, dueDate, context, type } = req.body;
      
      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];
      
      // Find the task
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Update fields if provided
      if (status !== undefined) tasks[taskIndex].status = status;
      if (priority !== undefined) tasks[taskIndex].priority = priority;
      if (task !== undefined) tasks[taskIndex].task = task;
      if (owner !== undefined) tasks[taskIndex].owner = owner;
      if (person !== undefined) tasks[taskIndex].person = person;
      if (dueDate !== undefined) tasks[taskIndex].dueDate = dueDate;
      if (context !== undefined) tasks[taskIndex].context = context;
      if (type !== undefined) tasks[taskIndex].type = type;
      if (archived !== undefined) {
        tasks[taskIndex].archived = archived;
        if (archived) {
          tasks[taskIndex].archivedAt = new Date().toISOString();
        }
      }
      if (column !== undefined) tasks[taskIndex].column = column;
      
      tasks[taskIndex].updatedAt = new Date().toISOString();
      
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
      
      // Check if task exists
      const task = tasks.find(t => t.id === id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
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

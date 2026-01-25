// pages/api/tasks/bulk.js
// Bulk operations on tasks (archive all done, etc.)

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { action } = req.body;
      
      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];
      
      if (action === 'archive-done') {
        // Archive all tasks with status 'done'
        let archivedCount = 0;
        tasks = tasks.map(t => {
          if (t.status === 'done' && !t.archived) {
            archivedCount++;
            return {
              ...t,
              archived: true,
              archivedAt: new Date().toISOString()
            };
          }
          return t;
        });
        
        await kv.set('tasks', tasks);
        
        return res.status(200).json({ 
          success: true, 
          archivedCount,
          message: `Archived ${archivedCount} completed tasks`
        });
      }
      
      if (action === 'unarchive-all') {
        // Unarchive all tasks
        let unarchivedCount = 0;
        tasks = tasks.map(t => {
          if (t.archived) {
            unarchivedCount++;
            return {
              ...t,
              archived: false,
              archivedAt: null
            };
          }
          return t;
        });
        
        await kv.set('tasks', tasks);
        
        return res.status(200).json({ 
          success: true, 
          unarchivedCount,
          message: `Unarchived ${unarchivedCount} tasks`
        });
      }
      
      if (action === 'delete-archived') {
        // Permanently delete all archived tasks
        const originalCount = tasks.length;
        tasks = tasks.filter(t => !t.archived);
        const deletedCount = originalCount - tasks.length;

        await kv.set('tasks', tasks);

        return res.status(200).json({
          success: true,
          deletedCount,
          message: `Permanently deleted ${deletedCount} archived tasks`
        });
      }

      if (action === 'reorder') {
        // Bulk reorder tasks within a column
        const { updates } = req.body; // Array of { id, order }
        if (!Array.isArray(updates)) {
          return res.status(400).json({ error: 'Updates array required' });
        }

        updates.forEach(({ id, order }) => {
          const taskIndex = tasks.findIndex(t => t.id === id);
          if (taskIndex !== -1) {
            tasks[taskIndex].order = order;
          }
        });

        await kv.set('tasks', tasks);

        return res.status(200).json({
          success: true,
          message: `Reordered ${updates.length} tasks`
        });
      }

      return res.status(400).json({ error: 'Unknown action' });
      
    } catch (error) {
      console.error('Bulk action error:', error);
      return res.status(500).json({ error: 'Failed to perform bulk action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

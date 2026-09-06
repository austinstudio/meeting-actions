// pages/api/tasks/bulk.js
// Bulk operations on tasks (archive all done, etc.)

import { kv } from '@vercel/kv';
import { updateTasks } from '../../../lib/task-store.mjs';
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
      const { action } = req.body;

      // Every action is a compare-and-set update of the shared array (lib/task-store.mjs).
      if (action === 'archive-done') {
        const { count } = await updateTasks(kv, tasks => {
          let count = 0;
          const next = tasks.map(t => {
            if (t.userId === userId && t.status === 'done' && !t.archived) {
              count++;
              return { ...t, archived: true, archivedAt: new Date().toISOString() };
            }
            return t;
          });
          return { tasks: next, count };
        });

        return res.status(200).json({
          success: true,
          archivedCount: count,
          message: `Archived ${count} completed tasks`
        });
      }

      if (action === 'unarchive-all') {
        const { count } = await updateTasks(kv, tasks => {
          let count = 0;
          const next = tasks.map(t => {
            if (t.userId === userId && t.archived) {
              count++;
              return { ...t, archived: false, archivedAt: null };
            }
            return t;
          });
          return { tasks: next, count };
        });

        return res.status(200).json({
          success: true,
          unarchivedCount: count,
          message: `Unarchived ${count} tasks`
        });
      }

      if (action === 'delete-archived') {
        const { count } = await updateTasks(kv, tasks => ({
          tasks: tasks.filter(t => !(t.userId === userId && t.archived)),
          count: tasks.filter(t => t.userId === userId && t.archived).length,
        }));

        return res.status(200).json({
          success: true,
          deletedCount: count,
          message: `Permanently deleted ${count} archived tasks`
        });
      }

      if (action === 'reorder') {
        // Bulk reorder tasks within a column (only user's tasks)
        const { updates } = req.body; // Array of { id, order }
        if (!Array.isArray(updates)) {
          return res.status(400).json({ error: 'Updates array required' });
        }

        await updateTasks(kv, tasks => {
          updates.forEach(({ id, order }) => {
            const taskIndex = tasks.findIndex(t => t.id === id && t.userId === userId);
            if (taskIndex !== -1) tasks[taskIndex].order = order;
          });
          return { tasks };
        });

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

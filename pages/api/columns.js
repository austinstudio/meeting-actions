// pages/api/columns.js
// Manage custom kanban columns
// Default columns are global, custom columns are per-user

import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';

const DEFAULT_COLUMNS = [
  { id: 'uncategorized', label: 'Uncategorized', color: 'purple', order: 0 },
  { id: 'todo', label: 'To Do', color: 'slate', order: 1 },
  { id: 'in-progress', label: 'In Progress', color: 'blue', order: 2 },
  { id: 'waiting', label: 'Waiting On Others', color: 'amber', order: 3 },
  { id: 'done', label: 'Done', color: 'emerald', order: 4 },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Return default columns + user's custom columns
  if (req.method === 'GET') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      let allColumns = await kv.get('columns') || [];

      // Get default columns (no userId) and user's custom columns
      const defaultColumns = DEFAULT_COLUMNS;
      const userCustomColumns = allColumns.filter(c => c.custom && c.userId === userId);

      // Combine: default columns + user's custom columns
      let columns = [...defaultColumns, ...userCustomColumns];

      // Re-number orders
      columns = columns.map((c, i) => ({ ...c, order: i }));

      return res.status(200).json({ columns });
    } catch (error) {
      console.error('Get columns error:', error);
      return res.status(500).json({ error: 'Failed to get columns' });
    }
  }

  // POST - Add a new custom column for the user
  if (req.method === 'POST') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { label, color } = req.body;

      if (!label) {
        return res.status(400).json({ error: 'Column label is required' });
      }

      let allColumns = await kv.get('columns') || [];

      // Generate ID from label with user prefix to avoid conflicts
      const id = `${userId.slice(-6)}_${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

      // Check for duplicate in user's columns
      const userColumns = allColumns.filter(c => c.userId === userId);
      if (userColumns.some(c => c.label.toLowerCase() === label.toLowerCase())) {
        return res.status(400).json({ error: 'Column with this name already exists' });
      }

      const newColumn = {
        id,
        userId,
        label,
        color: color || 'slate',
        order: DEFAULT_COLUMNS.length + userColumns.length,
        custom: true
      };

      allColumns.push(newColumn);
      await kv.set('columns', allColumns);

      // Return combined columns for user
      const columns = [...DEFAULT_COLUMNS, ...userColumns, newColumn].map((c, i) => ({ ...c, order: i }));

      return res.status(200).json({ success: true, column: newColumn, columns });
    } catch (error) {
      console.error('Add column error:', error);
      return res.status(500).json({ error: 'Failed to add column' });
    }
  }

  // PUT - Update user's custom columns (reorder, rename, etc.)
  if (req.method === 'PUT') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { columns: updatedColumns } = req.body;

      if (!updatedColumns || !Array.isArray(updatedColumns)) {
        return res.status(400).json({ error: 'Columns array is required' });
      }

      let allColumns = await kv.get('columns') || [];

      // Extract only the user's custom columns from the update
      // (ignore default columns and other users' columns in the request)
      const updatedCustomColumns = updatedColumns.filter(c => c.custom && c.userId === userId);

      // Remove user's old custom columns
      allColumns = allColumns.filter(c => !(c.custom && c.userId === userId));

      // Add updated custom columns
      allColumns = [...allColumns, ...updatedCustomColumns];

      await kv.set('columns', allColumns);

      // Return combined columns for user
      const userCustomColumns = allColumns.filter(c => c.custom && c.userId === userId);
      const columns = [...DEFAULT_COLUMNS, ...userCustomColumns].map((c, i) => ({ ...c, order: i }));

      return res.status(200).json({ success: true, columns });
    } catch (error) {
      console.error('Update columns error:', error);
      return res.status(500).json({ error: 'Failed to update columns' });
    }
  }

  // DELETE - Remove a user's custom column (moves tasks to 'uncategorized')
  if (req.method === 'DELETE') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { columnId } = req.body;

      if (!columnId) {
        return res.status(400).json({ error: 'Column ID is required' });
      }

      // Prevent deleting default required columns
      if (['uncategorized', 'todo', 'in-progress', 'waiting', 'done'].includes(columnId)) {
        return res.status(400).json({ error: 'Cannot delete default columns' });
      }

      let allColumns = await kv.get('columns') || [];
      let tasks = await kv.get('tasks') || [];

      // Verify the column belongs to this user
      const columnToDelete = allColumns.find(c => c.id === columnId && c.userId === userId);
      if (!columnToDelete) {
        return res.status(404).json({ error: 'Column not found' });
      }

      // Move user's tasks from deleted column to 'uncategorized'
      tasks = tasks.map(t => {
        if (t.userId === userId && t.status === columnId) {
          return { ...t, status: 'uncategorized' };
        }
        return t;
      });

      // Remove the column
      allColumns = allColumns.filter(c => c.id !== columnId);

      await kv.set('columns', allColumns);
      await kv.set('tasks', tasks);

      // Return combined columns for user
      const userCustomColumns = allColumns.filter(c => c.custom && c.userId === userId);
      const columns = [...DEFAULT_COLUMNS, ...userCustomColumns].map((c, i) => ({ ...c, order: i }));

      return res.status(200).json({ success: true, columns });
    } catch (error) {
      console.error('Delete column error:', error);
      return res.status(500).json({ error: 'Failed to delete column' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

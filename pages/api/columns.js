// pages/api/columns.js
// Manage custom kanban columns

import { kv } from '@vercel/kv';

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

  // GET - Return all columns
  if (req.method === 'GET') {
    try {
      let columns = await kv.get('columns');
      if (!columns || columns.length === 0) {
        // Initialize with default columns
        await kv.set('columns', DEFAULT_COLUMNS);
        columns = DEFAULT_COLUMNS;
      }
      return res.status(200).json({ columns });
    } catch (error) {
      console.error('Get columns error:', error);
      return res.status(500).json({ error: 'Failed to get columns' });
    }
  }

  // POST - Add a new column
  if (req.method === 'POST') {
    try {
      const { label, color } = req.body;
      
      if (!label) {
        return res.status(400).json({ error: 'Column label is required' });
      }
      
      let columns = await kv.get('columns') || DEFAULT_COLUMNS;
      
      // Generate ID from label
      const id = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      
      // Check for duplicate
      if (columns.some(c => c.id === id)) {
        return res.status(400).json({ error: 'Column with this name already exists' });
      }
      
      const newColumn = {
        id,
        label,
        color: color || 'slate',
        order: columns.length,
        custom: true
      };
      
      columns.push(newColumn);
      await kv.set('columns', columns);
      
      return res.status(200).json({ success: true, column: newColumn, columns });
    } catch (error) {
      console.error('Add column error:', error);
      return res.status(500).json({ error: 'Failed to add column' });
    }
  }

  // PUT - Update columns (reorder, rename, etc.)
  if (req.method === 'PUT') {
    try {
      const { columns } = req.body;
      
      if (!columns || !Array.isArray(columns)) {
        return res.status(400).json({ error: 'Columns array is required' });
      }
      
      await kv.set('columns', columns);
      
      return res.status(200).json({ success: true, columns });
    } catch (error) {
      console.error('Update columns error:', error);
      return res.status(500).json({ error: 'Failed to update columns' });
    }
  }

  // DELETE - Remove a column (moves tasks to 'todo')
  if (req.method === 'DELETE') {
    try {
      const { columnId } = req.body;
      
      if (!columnId) {
        return res.status(400).json({ error: 'Column ID is required' });
      }
      
      // Prevent deleting default required columns
      if (['uncategorized', 'todo', 'done'].includes(columnId)) {
        return res.status(400).json({ error: 'Cannot delete Uncategorized, To Do, or Done columns' });
      }

      let columns = await kv.get('columns') || DEFAULT_COLUMNS;
      let tasks = await kv.get('tasks') || [];

      // Move tasks from deleted column to 'uncategorized'
      tasks = tasks.map(t => {
        if (t.status === columnId) {
          return { ...t, status: 'uncategorized' };
        }
        return t;
      });
      
      // Remove the column
      columns = columns.filter(c => c.id !== columnId);
      
      // Reorder
      columns = columns.map((c, i) => ({ ...c, order: i }));
      
      await kv.set('columns', columns);
      await kv.set('tasks', tasks);
      
      return res.status(200).json({ success: true, columns });
    } catch (error) {
      console.error('Delete column error:', error);
      return res.status(500).json({ error: 'Failed to delete column' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

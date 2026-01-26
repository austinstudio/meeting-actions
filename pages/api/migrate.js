// pages/api/migrate.js
// One-time migration to assign existing content to the current user

import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the current user
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    // Get all existing data
    let tasks = await kv.get('tasks') || [];
    let meetings = await kv.get('meetings') || [];
    let columns = await kv.get('columns') || [];

    // Count items without userId
    const tasksToMigrate = tasks.filter(t => !t.userId).length;
    const meetingsToMigrate = meetings.filter(m => !m.userId).length;
    const columnsToMigrate = columns.filter(c => c.custom && !c.userId).length;

    // Assign userId to all tasks without one
    tasks = tasks.map(task => {
      if (!task.userId) {
        return { ...task, userId };
      }
      return task;
    });

    // Assign userId to all meetings without one
    meetings = meetings.map(meeting => {
      if (!meeting.userId) {
        return { ...meeting, userId };
      }
      return meeting;
    });

    // Assign userId to custom columns without one
    columns = columns.map(column => {
      if (column.custom && !column.userId) {
        return { ...column, userId };
      }
      return column;
    });

    // Save everything back
    await kv.set('tasks', tasks);
    await kv.set('meetings', meetings);
    await kv.set('columns', columns);

    return res.status(200).json({
      success: true,
      migrated: {
        tasks: tasksToMigrate,
        meetings: meetingsToMigrate,
        columns: columnsToMigrate
      },
      message: `Migrated ${tasksToMigrate} tasks, ${meetingsToMigrate} meetings, and ${columnsToMigrate} custom columns to your account`
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Migration failed' });
  }
}

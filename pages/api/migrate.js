// pages/api/migrate.js
// One-time migration to assign existing content to the current user

import { kv } from '@vercel/kv';
import { updateTasks } from '../../lib/task-store.mjs';
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
    let meetings = await kv.get('meetings') || [];
    let columns = await kv.get('columns') || [];

    // Tasks: assign userId under compare-and-set (lib/task-store.mjs)
    const { tasksToMigrate } = await updateTasks(kv, tasks => ({
      tasks: tasks.map(task => task.userId ? task : { ...task, userId }),
      tasksToMigrate: tasks.filter(t => !t.userId).length,
    }));

    // Count items without userId
    const meetingsToMigrate = meetings.filter(m => !m.userId).length;
    const columnsToMigrate = columns.filter(c => c.custom && !c.userId).length;

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

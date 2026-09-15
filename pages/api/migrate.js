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
    let columns = await kv.get('columns') || [];

    // Tasks: assign userId under compare-and-set (lib/task-store.mjs)
    const { tasksToMigrate } = await updateTasks(kv, tasks => ({
      tasks: tasks.map(task => task.userId ? task : { ...task, userId }),
      tasksToMigrate: tasks.filter(t => !t.userId).length,
    }));

    // Meetings: assign userId under compare-and-set (lib/meeting-store.js)
    const { meetingsToMigrate } = await updateMeetings(kv, meetings => ({
      meetings: meetings.map(meeting => meeting.userId ? meeting : { ...meeting, userId }),
      meetingsToMigrate: meetings.filter(m => !m.userId).length,
    }));

    // Count custom columns without userId
    const columnsToMigrate = columns.filter(c => c.custom && !c.userId).length;

    // Assign userId to custom columns without one
    columns = columns.map(column => {
      if (column.custom && !column.userId) {
        return { ...column, userId };
      }
      return column;
    });

    // Save columns back
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

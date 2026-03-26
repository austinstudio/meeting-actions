// pages/api/cron/daily-digest.js
// Runs daily at 10am ET via Vercel Cron. Builds a task digest and sends it to ntfy.

import { kv } from '@vercel/kv';

const NTFY_TOPIC = 'ma-builds-notify-07211976';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

export default async function handler(req, res) {
  // Verify this is a legitimate cron call (Vercel sends this header)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Also allow manual trigger with the inbound email secret for testing
    const emailSecret = req.headers['x-email-secret'];
    if (!emailSecret || emailSecret !== process.env.INBOUND_EMAIL_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) {
    return res.status(500).json({ error: 'User ID not configured' });
  }

  try {
    const allTasks = (await kv.get('tasks')) || [];
    const allMeetings = (await kv.get('meetings')) || [];

    const tasks = allTasks.filter(t => t.userId === userId && !t.deleted);
    const meetings = allMeetings.filter(m => m.userId === userId);

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now - 86400000).toISOString().split('T')[0];

    // --- Digest stats ---

    // Tasks added in last 24 hours
    const newTasks = tasks.filter(t => {
      if (!t.createdAt) return false;
      const created = new Date(t.createdAt);
      return (now - created) < 86400000;
    });

    // Tasks completed in last 24 hours
    const recentlyCompleted = tasks.filter(t => {
      if (t.status !== 'done') return false;
      const doneActivity = (t.activity || []).find(a => a.type === 'update' && a.field === 'status' && a.newValue === 'done');
      if (doneActivity) {
        return (now - new Date(doneActivity.timestamp)) < 86400000;
      }
      return false;
    });

    // Overdue tasks (have a dueDate before today, not done)
    const overdue = tasks.filter(t =>
      t.status !== 'done' && t.dueDate && t.dueDate < today
    ).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

    // High priority tasks (not done), sorted oldest first
    const highPriority = tasks.filter(t =>
      t.priority === 'high' && t.status !== 'done'
    ).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

    // Follow-up items (not done)
    const followUps = tasks.filter(t =>
      t.type === 'follow-up' && t.status !== 'done'
    ).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

    // Uncategorized tasks (inbox)
    const uncategorized = tasks.filter(t => t.status === 'uncategorized');

    // Total active tasks
    const activeTasks = tasks.filter(t => t.status !== 'done');

    // Meetings imported in last 24 hours
    const recentMeetings = meetings.filter(m => {
      if (!m.processedAt) return false;
      return (now - new Date(m.processedAt)) < 86400000;
    });

    // --- Build message ---
    const lines = [];

    // Header
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' });
    const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' });
    lines.push(`${dayName}, ${dateStr}`);
    lines.push('');

    // Quick stats
    lines.push(`Active: ${activeTasks.length} | New: ${newTasks.length} | Completed: ${recentlyCompleted.length} | Overdue: ${overdue.length}`);
    if (uncategorized.length > 0) {
      lines.push(`Inbox: ${uncategorized.length} unsorted`);
    }
    if (recentMeetings.length > 0) {
      lines.push(`Imports: ${recentMeetings.length} in last 24h`);
    }
    lines.push('');

    // Overdue
    if (overdue.length > 0) {
      lines.push(`OVERDUE (${overdue.length}):`);
      overdue.slice(0, 5).forEach(t => {
        const days = Math.floor((now - new Date(t.dueDate)) / 86400000);
        lines.push(`  ${days}d late - ${t.task}${t.owner !== 'Me' ? ` [${t.owner}]` : ''}`);
      });
      if (overdue.length > 5) lines.push(`  ...and ${overdue.length - 5} more`);
      lines.push('');
    }

    // High priority
    if (highPriority.length > 0) {
      lines.push(`HIGH PRIORITY (${highPriority.length}):`);
      highPriority.slice(0, 5).forEach(t => {
        const due = t.dueDate ? ` (due ${t.dueDate})` : '';
        lines.push(`  ${t.task}${due}${t.owner !== 'Me' ? ` [${t.owner}]` : ''}`);
      });
      if (highPriority.length > 5) lines.push(`  ...and ${highPriority.length - 5} more`);
      lines.push('');
    }

    // Follow-ups
    if (followUps.length > 0) {
      lines.push(`FOLLOW-UPS (${followUps.length}):`);
      followUps.slice(0, 5).forEach(t => {
        const person = t.person ? ` w/ ${t.person}` : '';
        const due = t.dueDate ? ` (due ${t.dueDate})` : '';
        lines.push(`  ${t.task}${person}${due}`);
      });
      if (followUps.length > 5) lines.push(`  ...and ${followUps.length - 5} more`);
      lines.push('');
    }

    // Recently added (if any)
    if (newTasks.length > 0) {
      lines.push(`NEW (${newTasks.length}):`);
      newTasks.slice(0, 5).forEach(t => {
        const source = t.activity?.[0]?.source ? ` (from ${t.activity[0].source})` : '';
        lines.push(`  ${t.task}${source}`);
      });
      if (newTasks.length > 5) lines.push(`  ...and ${newTasks.length - 5} more`);
      lines.push('');
    }

    // Recently completed (if any)
    if (recentlyCompleted.length > 0) {
      lines.push(`DONE (${recentlyCompleted.length}):`);
      recentlyCompleted.slice(0, 3).forEach(t => {
        lines.push(`  ${t.task}`);
      });
      if (recentlyCompleted.length > 3) lines.push(`  ...and ${recentlyCompleted.length - 3} more`);
    }

    const message = lines.join('\n').trim();

    // --- Determine priority for ntfy ---
    let ntfyPriority = '3'; // default
    if (overdue.length >= 5 || highPriority.length >= 3) {
      ntfyPriority = '4'; // high
    }
    if (overdue.length === 0 && highPriority.length === 0) {
      ntfyPriority = '2'; // low
    }

    // --- Send to ntfy ---
    const title = `Task Digest: ${activeTasks.length} active, ${overdue.length} overdue`;

    const ntfyResponse = await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': title,
        'Priority': ntfyPriority,
        'Tags': overdue.length > 0 ? 'warning,clipboard' : 'clipboard,white_check_mark',
      },
      body: message,
    });

    if (!ntfyResponse.ok) {
      console.error('ntfy send failed:', ntfyResponse.status, await ntfyResponse.text());
      return res.status(500).json({ error: 'Failed to send ntfy notification' });
    }

    console.log(`Daily digest sent: ${activeTasks.length} active, ${newTasks.length} new, ${recentlyCompleted.length} done, ${overdue.length} overdue`);

    return res.status(200).json({
      success: true,
      stats: {
        active: activeTasks.length,
        new: newTasks.length,
        completed: recentlyCompleted.length,
        overdue: overdue.length,
        highPriority: highPriority.length,
        followUps: followUps.length,
        uncategorized: uncategorized.length
      }
    });
  } catch (error) {
    console.error('Daily digest error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

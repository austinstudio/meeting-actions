// pages/api/capture/inbox.js
// The Quick Notes phone app's Triage mode: the user's uncategorized tasks, oldest first, plus
// the clear counts that drive the inbox burn-down dial.
// GET /api/capture/inbox?limit=N&tz=<IANA zone>   Auth: session cookie or Authorization: Bearer <token>.
// Response fields are a contract with the phone app; do not rename them.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { computeTriageStats } from '../../../lib/triage-stats.mjs';
import { byCreatedAt, liveTasks, meetingTitleIndex, parseLimit, serializeTask } from '../../../lib/capture-board.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const [tasks, meetings] = await Promise.all([
      kv.get('tasks').then(t => (Array.isArray(t) ? t : [])),
      kv.get('meetings').then(m => (Array.isArray(m) ? m : [])),
    ]);
    const limit = parseLimit(req.query.limit, { fallback: 50, max: 200 });
    const tz = typeof req.query.tz === 'string' ? req.query.tz : 'UTC';
    const titles = meetingTitleIndex(meetings, userId);
    const inbox = liveTasks(tasks, userId).filter(t => t.status === 'uncategorized').sort(byCreatedAt);

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      tasks: inbox.slice(0, limit).map(t => serializeTask(t, titles)),
      inboxCount: inbox.length,
      triage: computeTriageStats(tasks, userId, { tz }),
    });
  } catch (error) {
    console.error('capture/inbox error:', error);
    return res.status(500).json({ error: 'Failed to load inbox' });
  }
}

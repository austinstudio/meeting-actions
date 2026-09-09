// pages/api/capture/inbox.js
// The Quick Notes phone app's Triage mode: the user's uncategorized tasks, oldest first, plus
// the clear counts that drive the inbox burn-down dial.
// GET /api/capture/inbox?limit=N&tz=<IANA zone>   Auth: session cookie or Authorization: Bearer <token>.
// GET /api/capture/inbox?ids=a,b,c                 The named tasks (any status, up to 20, in the order
//                                                  asked) instead of the oldest page — the phone opens
//                                                  Triage on a task tapped in Captures, which is at the
//                                                  newest end of the inbox. inboxCount/triage unchanged.
// Response fields are a contract with the phone app; do not rename them.

const MAX_IDS = 20;

export function parseIds(raw) {
  const text = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';
  const ids = text.split(',').map(s => s.trim()).filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_IDS);
}

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
    const live = liveTasks(tasks, userId);
    const inbox = live.filter(t => t.status === 'uncategorized').sort(byCreatedAt);
    const ids = parseIds(req.query.ids);
    const page = ids.length > 0
      ? ids.map(id => live.find(t => t.id === id)).filter(Boolean)
      : inbox.slice(0, limit);

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      tasks: page.map(t => serializeTask(t, titles)),
      inboxCount: inbox.length,
      triage: computeTriageStats(tasks, userId, { tz }),
    });
  } catch (error) {
    console.error('capture/inbox error:', error);
    return res.status(500).json({ error: 'Failed to load inbox' });
  }
}

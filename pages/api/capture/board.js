// pages/api/capture/board.js
// The Quick Notes phone app's board view: the user's live board tasks (inbox and done-over-30-days
// excluded — see lib/capture-board.mjs boardTasks), due-date first, plus per-column and per-person counts
// over ALL live tasks so the phone never derives totals from a truncated slice, the column list and the
// triage stats. `truncated`/`totalBoardTasks` tell the phone when `limit` cut the list.
// GET /api/capture/board?limit=N&tz=<IANA zone>   Auth: session cookie or Authorization: Bearer <token>.
// Response fields are a contract with the phone app; do not rename them.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { computeTriageStats } from '../../../lib/triage-stats.mjs';
import { assigneeCounts, boardTasks, byDueThenCreated, columnCounts, liveTasks, meetingTitleIndex, parseLimit, serializeTask } from '../../../lib/capture-board.mjs';
import { DEFAULT_COLUMNS } from '../../../components/constants';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const [tasks, meetings, allColumns] = await Promise.all([
      kv.get('tasks').then(t => (Array.isArray(t) ? t : [])),
      kv.get('meetings').then(m => (Array.isArray(m) ? m : [])),
      kv.get('columns').then(c => (Array.isArray(c) ? c : [])),
    ]);
    const limit = parseLimit(req.query.limit, { fallback: 300, max: 1000 });
    const tz = typeof req.query.tz === 'string' ? req.query.tz : 'UTC';
    const titles = meetingTitleIndex(meetings, userId);
    const live = liveTasks(tasks, userId).sort(byDueThenCreated);
    const board = boardTasks(live);
    const customColumns = allColumns.filter(c => c && c.custom && c.userId === userId);
    const columns = [...DEFAULT_COLUMNS, ...customColumns].map(c => ({ id: c.id, label: c.label }));

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      tasks: board.slice(0, limit).map(t => serializeTask(t, titles)),
      inboxCount: live.filter(t => t.status === 'uncategorized').length,
      columns,
      triage: computeTriageStats(tasks, userId, { tz }),
      columnCounts: columnCounts(live),
      assigneeCounts: assigneeCounts(live),
      truncated: board.length > limit,
      totalBoardTasks: board.length,
    });
  } catch (error) {
    console.error('capture/board error:', error);
    return res.status(500).json({ error: 'Failed to load board' });
  }
}

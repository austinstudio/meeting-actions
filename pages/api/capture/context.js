// pages/api/capture/context.js
// Everything the phone's on-device parser needs for context (PRD-12 Stage B):
// known people (for name correction and speech biasing), columns, tags, today's date.
// Auth: Authorization: Bearer <token>.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { getKnownPeople, todayInTimeZone } from '../../../lib/extract';
import { computeTriageStats } from '../../../lib/triage-stats.mjs';
import { DEFAULT_COLUMNS, PREDEFINED_TAGS } from '../../../components/constants';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const [people, allColumns, tasks] = await Promise.all([
      getKnownPeople(userId),
      kv.get('columns').then(c => c || []),
      kv.get('tasks').then(t => t || []),
    ]);
    const customColumns = allColumns.filter(c => c.custom && c.userId === userId);
    const columns = [...DEFAULT_COLUMNS, ...customColumns].map(c => ({ id: c.id, label: c.label }));
    const usedTags = new Set();
    for (const t of tasks) if (t.userId === userId && !t.deleted) for (const tag of t.tags || []) usedTags.add(tag);
    const tags = Array.from(new Set([...PREDEFINED_TAGS, ...usedTags])).slice(0, 100);
    const uncategorized = tasks.filter(t => t.userId === userId && t.status === 'uncategorized' && !t.deleted && !t.archived).length;
    const tz = typeof req.query.tz === 'string' ? req.query.tz : 'UTC';

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).json({
      today: todayInTimeZone(tz),
      people,
      columns,
      tags,
      inboxCount: uncategorized,
      triage: computeTriageStats(tasks, userId, { tz }),
    });
  } catch (error) {
    console.error('capture/context error:', error);
    return res.status(500).json({ error: 'Failed to load context' });
  }
}

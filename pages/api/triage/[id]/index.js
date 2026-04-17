// pages/api/triage/[id]/index.js
// PATCH /api/triage/[id] — update a single triage record.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { DEFAULT_TRIAGE } from '../../../../lib/triage-utils';

const ALLOWED_STATES = ['needs_reply', 'waiting_on', 'fyi_only', 'done', 'dismissed'];
const ALLOWED_PRIORITIES = ['high', 'medium', 'low'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'outlook_id required' });

  const { triageState, snoozeUntil, priority, linkedTaskId } = req.body || {};
  if (triageState && !ALLOWED_STATES.includes(triageState)) {
    return res.status(400).json({ error: 'Invalid triageState' });
  }
  if (priority && !ALLOWED_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  try {
    const key = `email-triage:${userId}`;
    const map = (await kv.get(key)) || {};
    const existing = map[id] || { ...DEFAULT_TRIAGE, outlookId: id };
    const updated = {
      ...existing,
      ...(triageState !== undefined ? { triageState } : {}),
      ...(snoozeUntil !== undefined ? { snoozeUntil } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(linkedTaskId !== undefined ? { linkedTaskId } : {}),
      updatedAt: new Date().toISOString()
    };
    map[id] = updated;
    await kv.set(key, map);
    return res.status(200).json({ triage: updated });
  } catch (error) {
    console.error('PATCH /api/triage/[id] error:', error);
    return res.status(500).json({ error: 'Failed to update triage' });
  }
}

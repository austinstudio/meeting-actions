// pages/api/triage/index.js
// GET /api/triage — returns emails joined with user-specific triage records.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { compareForQueue, computeStats, isInQueue, isOnBoard, isSnoozed } from '../../../lib/triage-utils';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const { mode = 'queue', priority = 'all', sender = '', minWaitDays = '0' } = req.query;

    // 1. Pull email IDs in date order (newest first). zrange with rev=true.
    const ids = await kv.zrange('emails:by_date', 0, -1, { rev: true });
    if (!ids || ids.length === 0) {
      return res.status(200).json({ emails: [], stats: { total: 0, analyzed: 0, needsReply: 0, waitingOn: 0, fyiOnly: 0, done: 0 } });
    }

    // 2. Batch fetch emails.
    const keys = ids.map(id => `email:${id}`);
    const emails = await kv.mget(...keys);

    // 3. Fetch triage map for this user.
    const triageMap = (await kv.get(`email-triage:${userId}`)) || {};

    // 4. Join.
    const rows = emails
      .filter(Boolean)
      .map(e => ({ ...e, triage: triageMap[e.outlook_id] || null }));

    // 5. Apply filters.
    const minWait = Number(minWaitDays) || 0;
    let filtered = rows.filter(r => {
      if (priority !== 'all' && r.triage?.priority !== priority) return false;
      if (sender && !(r.sender_email || '').toLowerCase().includes(sender.toLowerCase())) return false;
      if (minWait > 0) {
        const days = Math.floor((Date.now() - new Date(r.sent_at).getTime()) / (1000 * 60 * 60 * 24));
        if (days < minWait) return false;
      }
      return true;
    });

    // 6. Visibility per mode.
    if (mode === 'queue' || mode === 'focus') {
      filtered = filtered.filter(isInQueue);
      filtered.sort(compareForQueue);
    } else if (mode === 'board') {
      filtered = filtered.filter(isOnBoard);
    }

    const stats = computeStats(rows);
    return res.status(200).json({ emails: filtered, stats });
  } catch (error) {
    console.error('GET /api/triage error:', error);
    return res.status(500).json({ error: 'Failed to load triage' });
  }
}

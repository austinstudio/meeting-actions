// pages/api/pebble/pending.js — GET: Pebble memos waiting for the phone (bearer auth). Oldest first.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { listPending, serializeMemo } from '../../../lib/pebble-memos.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  try {
    const memos = await listPending(kv, userId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ memos: memos.map(serializeMemo) });
  } catch (error) {
    console.error('pebble/pending error:', error);
    return res.status(500).json({ error: 'Failed to list memos' });
  }
}

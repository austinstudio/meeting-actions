// pages/api/pebble/ack.js — POST { id, captureId?, outcome? }: the phone has the memo; free the audio.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { ackMemo, isSafeMemoId } from '../../../lib/pebble-memos.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { id, captureId, outcome } = req.body || {};
  if (!isSafeMemoId(id)) return res.status(400).json({ error: 'Bad memo id' });
  try {
    const known = await ackMemo(kv, userId, id, {
      captureId: typeof captureId === 'string' ? captureId.slice(0, 80) : null,
      outcome: outcome === 'skipped' ? 'skipped' : 'ingested',
    });
    return res.status(200).json({ ok: true, known });
  } catch (error) {
    console.error('pebble/ack error:', error);
    return res.status(500).json({ error: 'Failed to acknowledge memo' });
  }
}

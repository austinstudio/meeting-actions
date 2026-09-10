// pages/api/pebble/audio/[id].js — GET: the memo's audio bytes (bearer auth). Gone after the phone acks.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { audioKey, memoKey, isSafeMemoId } from '../../../../lib/pebble-memos.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const id = String(req.query.id || '');
  if (!isSafeMemoId(id)) return res.status(400).json({ error: 'Bad memo id' });
  try {
    const [memo, base64] = await Promise.all([kv.get(memoKey(userId, id)), kv.get(audioKey(userId, id))]);
    if (!base64) return res.status(404).json({ error: 'Audio not found' });
    const bytes = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', memo?.audio?.contentType || 'audio/mp4');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('pebble/audio error:', error);
    return res.status(500).json({ error: 'Failed to read audio' });
  }
}

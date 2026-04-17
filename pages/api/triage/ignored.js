// pages/api/triage/ignored.js
// GET / POST / DELETE the user's triage ignore list.
// Stored at KV key `email-ignore:{userId}` as an array of entries.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { normalizeSender, matchesIgnoreEntry } from '../../../lib/triage-ignore';

const ALLOWED_TYPES = ['email', 'domain'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = await requireAuth(req, res);
  if (!userId) return;
  const key = `email-ignore:${userId}`;

  if (req.method === 'GET') {
    const list = (await kv.get(key)) || [];
    return res.status(200).json({ ignored: list });
  }

  if (req.method === 'POST') {
    const { type, pattern, sweep = true } = req.body || {};
    if (!ALLOWED_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const norm = normalizeSender(pattern);
    if (!norm) return res.status(400).json({ error: 'Pattern required' });

    const list = (await kv.get(key)) || [];
    const exists = list.some(e => e.type === type && normalizeSender(e.pattern) === norm);
    if (!exists) {
      list.push({ type, pattern: norm, createdAt: new Date().toISOString() });
      await kv.set(key, list);
    }

    let dismissed = 0;
    if (sweep) {
      const triageKey = `email-triage:${userId}`;
      const triageMap = (await kv.get(triageKey)) || {};
      const ids = await kv.zrange('emails:by_date', 0, -1, { rev: true });
      if (ids?.length) {
        const emails = (await kv.mget(...ids.map(id => `email:${id}`))).filter(Boolean);
        const entry = { type, pattern: norm };
        for (const email of emails) {
          if (!matchesIgnoreEntry(email.sender_email, entry)) continue;
          const existing = triageMap[email.outlook_id] || {};
          if (existing.triageState === 'dismissed') continue;
          triageMap[email.outlook_id] = {
            ...existing,
            outlookId: email.outlook_id,
            triageState: 'dismissed',
            updatedAt: new Date().toISOString()
          };
          dismissed += 1;
        }
        if (dismissed > 0) await kv.set(triageKey, triageMap);
      }
    }

    return res.status(200).json({ ignored: list, dismissed });
  }

  if (req.method === 'DELETE') {
    const { type, pattern } = req.body || {};
    const norm = normalizeSender(pattern);
    const list = (await kv.get(key)) || [];
    const next = list.filter(e => !(e.type === type && normalizeSender(e.pattern) === norm));
    await kv.set(key, next);
    return res.status(200).json({ ignored: next });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

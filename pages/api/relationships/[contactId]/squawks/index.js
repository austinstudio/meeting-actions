// POST /api/relationships/<contactId>/squawks { text, type? } — type raise (default) | feedback | ask
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../../lib/auth';
import { addSquawk, getRoster, findEntry } from '../../../../../lib/relationships-store.mjs';
import { withErrors, param } from '../../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId);
    if (!findEntry(await getRoster(kv, userId), contactId)) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const squawk = await addSquawk(kv, userId, contactId, { text: body.text, type: body.type, source: body.source === 'voice' ? 'voice' : 'manual' });
    return res.status(201).json({ squawk });
  });
}

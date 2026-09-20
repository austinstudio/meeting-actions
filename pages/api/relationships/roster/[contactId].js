// DELETE /api/relationships/roster/<contactId> — remove from the roster; the contact itself is untouched.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { removeFromRoster } from '../../../../lib/relationships-store.mjs';
import { withErrors, param } from '../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const removed = await removeFromRoster(kv, userId, param(req.query.contactId));
    if (!removed) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    return res.status(200).json({ ok: true });
  });
}

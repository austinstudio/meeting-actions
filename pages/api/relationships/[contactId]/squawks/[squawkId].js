// PATCH  /api/relationships/<contactId>/squawks/<id> { raisedAt?: string|null, text? }
// DELETE /api/relationships/<contactId>/squawks/<id>
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../../lib/auth';
import { patchSquawk, deleteSquawk } from '../../../../../lib/relationships-store.mjs';
import { withErrors, param } from '../../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId), squawkId = param(req.query.squawkId);
    if (req.method === 'PATCH') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const squawk = await patchSquawk(kv, userId, contactId, squawkId, { raisedAt: body.raisedAt, text: body.text });
      if (!squawk) return res.status(404).json({ error: 'Unknown squawk', code: 'unknown_squawk' });
      return res.status(200).json({ squawk });
    }
    if (req.method === 'DELETE') {
      const ok = await deleteSquawk(kv, userId, contactId, squawkId);
      if (!ok) return res.status(404).json({ error: 'Unknown squawk', code: 'unknown_squawk' });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  });
}

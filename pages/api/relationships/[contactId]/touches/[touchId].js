// DELETE /api/relationships/<contactId>/touches/<touchId> — undo a touch; returns the new rollup.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../../lib/auth';
import { deleteTouch, userContacts } from '../../../../../lib/relationships-store.mjs';
import { withErrors, param, readArrays } from '../../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId);
    const { contacts, tasks } = await readArrays(kv, ['contacts', 'tasks']);
    const contact = userContacts(contacts, userId).find(c => c.id === contactId) || null;
    const rollup = await deleteTouch(kv, userId, contactId, param(req.query.touchId), { contact, tasks });
    if (!rollup) return res.status(404).json({ error: 'Unknown touch', code: 'unknown_touch' });
    return res.status(200).json({ rollup });
  });
}

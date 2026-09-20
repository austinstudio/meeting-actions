// GET /api/relationships/<contactId>/rundown — person, squawks, threads, mentions, last 10 touches.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { rundownFor } from '../../../../lib/relationships-store.mjs';
import { withErrors, param, readArrays } from '../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const { contacts, tasks, meetings } = await readArrays(kv, ['contacts', 'tasks', 'meetings']);
    const rundown = await rundownFor(kv, userId, param(req.query.contactId), { contacts, tasks, meetings });
    if (!rundown) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(rundown);
  });
}

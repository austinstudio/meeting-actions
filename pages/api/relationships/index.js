// GET /api/relationships — roster (crew then guests, rank order) with contact and rollup per person.
// Contract: docs/relationships-api.md. Auth: session or bearer (requireAuth).
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { listPeople } from '../../../lib/relationships-store.mjs';
import { withErrors, readArrays } from '../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const { contacts } = await readArrays(kv, ['contacts']);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(await listPeople(kv, userId, { contacts }));
  });
}

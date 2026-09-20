// GET /api/relationships/review — pending automatic-touch guesses, oldest first, ≤ 50.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { listReview } from '../../../../lib/relationships-store.mjs';
import { withErrors } from '../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ items: await listReview(kv, userId) });
  });
}

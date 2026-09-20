// POST /api/relationships/review/<id> { accept: bool, aliasOf?: contactId }
// Accept writes a touch (to aliasOf when given); reject counts against the source and mutes it after 3.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { resolveReview } from '../../../../lib/relationships-store.mjs';
import { withErrors, param, readArrays } from '../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (typeof body.accept !== 'boolean') return res.status(400).json({ error: 'accept must be true or false', code: 'bad_body' });
    const { contacts, tasks } = await readArrays(kv, ['contacts', 'tasks']);
    const result = await resolveReview(kv, userId, param(req.query.id), { accept: body.accept, aliasOf: typeof body.aliasOf === 'string' ? body.aliasOf : undefined, contacts, tasks });
    if (!result) return res.status(404).json({ error: 'Unknown review item', code: 'unknown_review' });
    return res.status(200).json(result);
  });
}

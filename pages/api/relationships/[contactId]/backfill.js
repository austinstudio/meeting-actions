// POST /api/relationships/<contactId>/backfill — "Rescan": look back through meetings, the email archive,
// recent transcripts and finished tasks for this roster person and write the touches the feeds would have
// produced. Idempotent (de-duped by sourceRef); bounded by a KV command budget and a deadline.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { getRoster, findEntry } from '../../../../lib/relationships-store.mjs';
import { backfillPerson } from '../../../../lib/relationships-backfill.mjs';
import { withErrors, param } from '../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId);
    if (!findEntry(await getRoster(kv, userId), contactId)) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    return res.status(200).json(await backfillPerson(kv, userId, contactId));
  });
}

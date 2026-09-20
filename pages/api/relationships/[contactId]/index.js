// PATCH /api/relationships/<contactId>  { cadenceDays?, holdUntil?: string|null, list?, mutedSources? }
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { patchEntry, setMutedSources, getPerson, userContacts, publicContact, computeRollup, getRoster, findEntry } from '../../../../lib/relationships-store.mjs';
import { withErrors, param, readArrays } from '../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let entry = findEntry(await getRoster(kv, userId), contactId);
    if (!entry) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    if (body.cadenceDays !== undefined || body.holdUntil !== undefined || body.list !== undefined) {
      entry = await patchEntry(kv, userId, contactId, { cadenceDays: body.cadenceDays, holdUntil: body.holdUntil, list: body.list });
    }
    if (body.mutedSources !== undefined) await setMutedSources(kv, userId, contactId, body.mutedSources);
    const { contacts, tasks } = await readArrays(kv, ['contacts', 'tasks']);
    const contact = userContacts(contacts, userId).find(c => c.id === contactId) || null;
    const person = await getPerson(kv, userId, contactId);
    return res.status(200).json({ person: { entry, contact: publicContact(contact), rollup: person.rollup ?? computeRollup(person, { contact, tasks, userId }) }, mutedSources: person.mutedSources });
  });
}

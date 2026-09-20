// GET  /api/relationships/<contactId>/touches?limit=50          — newest first
// POST /api/relationships/<contactId>/touches { at?, channel, about?, direction? } — manual touch
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../../lib/auth';
import { addTouch, getPerson, getRoster, findEntry, userContacts } from '../../../../../lib/relationships-store.mjs';
import { withErrors, param, readArrays } from '../../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId);
    if (!findEntry(await getRoster(kv, userId), contactId)) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    if (req.method === 'GET') {
      const limit = Math.min(200, Math.max(1, Number(param(req.query.limit)) || 50));
      const person = await getPerson(kv, userId, contactId);
      return res.status(200).json({ touches: person.touches.slice(0, limit) });
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const { contacts, tasks } = await readArrays(kv, ['contacts', 'tasks']);
      const contact = userContacts(contacts, userId).find(c => c.id === contactId) || null;
      const result = await addTouch(kv, userId, contactId, { at: body.at, channel: body.channel, about: body.about, direction: body.direction, source: 'manual', confidence: 'high' }, { contact, tasks });
      return res.status(201).json(result);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  });
}

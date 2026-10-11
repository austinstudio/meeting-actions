// GET  /api/relationships/<contactId>/touches?limit=50          — newest first
// POST /api/relationships/<contactId>/touches { at?, channel, about?, direction?, clientId? } — manual touch
//      201 { touch, rollup } on insert; with a clientId the person already holds, 200 with the existing touch (safe retry)
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../../lib/auth';
import { addTouch, getPerson, getRoster, findEntry, userContacts, CLIENT_ID_MAX } from '../../../../../lib/relationships-store.mjs';
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
      if (body.clientId !== undefined && body.clientId !== null && (typeof body.clientId !== 'string' || body.clientId.length > CLIENT_ID_MAX)) {
        return res.status(400).json({ error: `clientId must be a string of at most ${CLIENT_ID_MAX} characters`, code: 'bad_client_id' });
      }
      const { touch, rollup, created } = await addTouch(kv, userId, contactId, { at: body.at, channel: body.channel, about: body.about, direction: body.direction, clientId: body.clientId, source: 'manual', confidence: 'high' }, { contact, tasks });
      return res.status(created ? 201 : 200).json({ touch, rollup });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  });
}

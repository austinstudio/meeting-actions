// PUT  /api/relationships/roster  { crew: [contactId…], guests: [contactId…] }  — full order (CAS)
// POST /api/relationships/roster  { contactId, list, cadenceDays? }             — append
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { addToRoster, setRosterOrder, listPeople, userContacts, publicContact, getPerson, computeRollup } from '../../../lib/relationships-store.mjs';
import { withErrors, readArrays } from '../../../lib/relationships-routes.mjs';
import { backfillPerson } from '../../../lib/relationships-backfill.mjs';

export default async function handler(req, res) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { contacts } = await readArrays(kv, ['contacts']);
    if (req.method === 'PUT') {
      const crew = Array.isArray(body.crew) ? body.crew.map(String) : [];
      const guests = Array.isArray(body.guests) ? body.guests.map(String) : [];
      await setRosterOrder(kv, userId, { crew, guests }, contacts);
      return res.status(200).json(await listPeople(kv, userId, { contacts }));
    }
    if (req.method === 'POST') {
      const contactId = typeof body.contactId === 'string' ? body.contactId : '';
      const contact = userContacts(contacts, userId).find(c => c.id === contactId);
      if (!contact) return res.status(404).json({ error: 'Unknown contact', code: 'unknown_contact' });
      const entry = await addToRoster(kv, userId, { contactId, list: body.list, cadenceDays: body.cadenceDays });
      const { tasks } = await readArrays(kv, ['tasks']);
      // Look back through meetings, mail, transcripts and finished tasks so the person does not start at
      // "No contact logged". Inline (Vercel may freeze the function after the response); never fails the add.
      let backfill = null;
      try { backfill = await backfillPerson(kv, userId, contactId, { contacts, tasks }); }
      catch (error) { console.error('relationships backfill failed:', error?.message || error); backfill = { error: 'backfill_failed' }; }
      const person = await getPerson(kv, userId, contactId);
      const rollup = person.rollup ?? computeRollup(person, { contact, tasks, userId });
      return res.status(201).json({ person: { entry, contact: publicContact(contact), rollup }, backfill });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  });
}

// POST /api/relationships/<contactId>/pins { taskId } — pin a board task to the person
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../../lib/auth';
import { setPin, getRoster, findEntry, userContacts } from '../../../../../lib/relationships-store.mjs';
import { withErrors, param, readArrays } from '../../../../../lib/relationships-routes.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  return withErrors(res, async () => {
    const contactId = param(req.query.contactId);
    if (!findEntry(await getRoster(kv, userId), contactId)) return res.status(404).json({ error: 'Not on the roster', code: 'not_on_roster' });
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId : '';
    const { contacts, tasks } = await readArrays(kv, ['contacts', 'tasks']);
    if (!tasks.some(t => t && t.id === taskId && t.userId === userId)) return res.status(404).json({ error: 'Unknown task', code: 'unknown_task' });
    const contact = userContacts(contacts, userId).find(c => c.id === contactId) || null;
    const pinnedTaskIds = await setPin(kv, userId, contactId, taskId, true, { contact, tasks });
    return res.status(200).json({ pinnedTaskIds });
  });
}

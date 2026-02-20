// pages/api/contacts/[id].js
// GET (+ linked meetings/tasks), PATCH (update w/ activity tracking), POST (add note), DELETE (soft/permanent)

import { kv } from '@vercel/kv';
import { requireAuth, getUserName } from '../../../lib/auth';
import { normalizeAliases, normalizeStringArray, contactMatchesName } from '../../../lib/contact-utils';

function createActivityEntry(type, field, oldValue, newValue, user = 'Unknown') {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    field,
    oldValue,
    newValue,
    user,
    timestamp: new Date().toISOString()
  };
}

const trackableFields = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  role: 'role',
  team: 'team',
  linkedInUrl: 'LinkedIn URL',
  howWeMet: 'how we met',
  relationshipContext: 'relationship context'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;

  // GET - Get single contact with linked meetings/tasks
  if (req.method === 'GET') {
    try {
      const allContacts = await kv.get('contacts') || [];
      const contact = allContacts.find(c => c.id === id && c.userId === userId);

      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      // Auto-link meetings by matching name + aliases against participants
      const allMeetings = await kv.get('meetings') || [];
      const userMeetings = allMeetings.filter(m => m.userId === userId);
      const linkedMeetings = userMeetings.filter(m => {
        if (!m.participants || !Array.isArray(m.participants)) return false;
        return m.participants.some(p => contactMatchesName(contact, p));
      }).map(m => ({
        id: m.id,
        title: m.title,
        date: m.date,
        participants: m.participants
      }));

      // Auto-link tasks by matching name + aliases against owner and person
      const allTasks = await kv.get('tasks') || [];
      const userTasks = allTasks.filter(t => t.userId === userId && !t.deleted);
      const linkedTasks = userTasks.filter(t => {
        return contactMatchesName(contact, t.owner) || contactMatchesName(contact, t.person);
      }).map(t => ({
        id: t.id,
        task: t.task,
        status: t.status,
        priority: t.priority,
        owner: t.owner,
        person: t.person,
        dueDate: t.dueDate,
        column: t.column
      }));

      return res.status(200).json({
        success: true,
        contact,
        linkedMeetings,
        linkedTasks
      });
    } catch (error) {
      console.error('Get contact error:', error);
      return res.status(500).json({ error: 'Failed to get contact' });
    }
  }

  // POST - Add a note to the contact
  if (req.method === 'POST') {
    try {
      const { note } = req.body;
      const userName = await getUserName(req, res);

      if (!note || !note.trim()) {
        return res.status(400).json({ error: 'Note is required' });
      }

      let allContacts = await kv.get('contacts') || [];
      const idx = allContacts.findIndex(c => c.id === id && c.userId === userId);

      if (idx === -1) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (!allContacts[idx].notes) allContacts[idx].notes = [];
      if (!allContacts[idx].activity) allContacts[idx].activity = [];

      const newNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: note.trim(),
        user: userName,
        timestamp: new Date().toISOString()
      };

      allContacts[idx].notes.push(newNote);
      allContacts[idx].activity.push(
        createActivityEntry('note', null, null, note.trim(), userName)
      );

      if (allContacts[idx].activity.length > 50) {
        allContacts[idx].activity = allContacts[idx].activity.slice(-50);
      }

      allContacts[idx].updatedAt = new Date().toISOString();
      await kv.set('contacts', allContacts);

      return res.status(200).json({ success: true, note: newNote, contact: allContacts[idx] });
    } catch (error) {
      console.error('Add note error:', error);
      return res.status(500).json({ error: 'Failed to add note' });
    }
  }

  // PATCH - Update contact with activity tracking
  if (req.method === 'PATCH') {
    try {
      const userName = await getUserName(req, res);

      let allContacts = await kv.get('contacts') || [];
      const idx = allContacts.findIndex(c => c.id === id && c.userId === userId);

      if (idx === -1) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      const current = allContacts[idx];
      if (!current.activity) current.activity = [];

      const changes = [];

      // Track simple string field changes
      for (const [field, label] of Object.entries(trackableFields)) {
        if (req.body[field] !== undefined) {
          const newVal = req.body[field]?.trim() || '';
          const oldVal = current[field] || '';
          if (newVal !== oldVal) {
            changes.push(createActivityEntry('update', field, oldVal, newVal, userName));
            current[field] = newVal;
          }
        }
      }

      // Track aliases changes
      if (req.body.aliases !== undefined) {
        const newAliases = normalizeAliases(req.body.aliases);
        const oldAliases = current.aliases || [];
        if (JSON.stringify(oldAliases) !== JSON.stringify(newAliases)) {
          changes.push(createActivityEntry('update', 'aliases', oldAliases.join(', '), newAliases.join(', '), userName));
          current.aliases = newAliases;
        }
      }

      // Track tags changes
      if (req.body.tags !== undefined) {
        const newTags = normalizeStringArray(req.body.tags);
        const oldTags = current.tags || [];
        if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) {
          changes.push(createActivityEntry('update', 'tags', oldTags.join(', '), newTags.join(', '), userName));
          current.tags = newTags;
        }
      }

      // Track projects changes
      if (req.body.projects !== undefined) {
        const newProjects = normalizeStringArray(req.body.projects);
        const oldProjects = current.projects || [];
        if (JSON.stringify(oldProjects) !== JSON.stringify(newProjects)) {
          changes.push(createActivityEntry('update', 'projects', oldProjects.join(', '), newProjects.join(', '), userName));
          current.projects = newProjects;
        }
      }

      current.activity.push(...changes);

      if (current.activity.length > 50) {
        current.activity = current.activity.slice(-50);
      }

      current.updatedAt = new Date().toISOString();
      allContacts[idx] = current;

      await kv.set('contacts', allContacts);

      return res.status(200).json({ success: true, contact: current });
    } catch (error) {
      console.error('Update contact error:', error);
      return res.status(500).json({ error: 'Failed to update contact' });
    }
  }

  // DELETE - Soft or permanent delete
  if (req.method === 'DELETE') {
    try {
      const { permanent } = req.body || {};
      const userName = await getUserName(req, res);

      let allContacts = await kv.get('contacts') || [];
      const idx = allContacts.findIndex(c => c.id === id && c.userId === userId);

      if (idx === -1) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (permanent) {
        allContacts = allContacts.filter(c => c.id !== id);
      } else {
        allContacts[idx].deleted = true;
        allContacts[idx].deletedAt = new Date().toISOString();
        if (!allContacts[idx].activity) allContacts[idx].activity = [];
        allContacts[idx].activity.push(
          createActivityEntry('delete', null, null, 'deleted', userName)
        );
      }

      await kv.set('contacts', allContacts);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete contact error:', error);
      return res.status(500).json({ error: 'Failed to delete contact' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

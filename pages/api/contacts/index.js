// pages/api/contacts/index.js
// GET (list all) + POST (create) contacts

import { kv } from '@vercel/kv';
import { requireAuth, getUserName } from '../../../lib/auth';
import { normalizeAliases, normalizeStringArray } from '../../../lib/contact-utils';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  // GET - List user's contacts
  if (req.method === 'GET') {
    try {
      const allContacts = await kv.get('contacts') || [];
      const contacts = allContacts.filter(c => c.userId === userId && !c.deleted);
      return res.status(200).json({ contacts });
    } catch (error) {
      console.error('Get contacts error:', error);
      return res.status(500).json({ error: 'Failed to get contacts' });
    }
  }

  // POST - Create a new contact
  if (req.method === 'POST') {
    try {
      const {
        name, aliases, email, phone, company, role, team,
        linkedInUrl, tags, projects, howWeMet, relationshipContext
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const userName = await getUserName(req, res);
      const now = new Date().toISOString();

      const contact = {
        id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        name: name.trim(),
        aliases: normalizeAliases(aliases),
        email: email?.trim() || '',
        phone: phone?.trim() || '',
        company: company?.trim() || '',
        role: role?.trim() || '',
        team: team?.trim() || '',
        linkedInUrl: linkedInUrl?.trim() || '',
        tags: normalizeStringArray(tags),
        projects: normalizeStringArray(projects),
        howWeMet: howWeMet?.trim() || '',
        relationshipContext: relationshipContext?.trim() || '',
        notes: [],
        activity: [{
          id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'create',
          field: null,
          oldValue: null,
          newValue: null,
          user: userName,
          timestamp: now
        }],
        createdAt: now,
        updatedAt: now,
        deleted: false,
        deletedAt: null,
        migratedFromGlossaryId: null
      };

      let allContacts = await kv.get('contacts') || [];
      allContacts.push(contact);
      await kv.set('contacts', allContacts);

      return res.status(200).json({ success: true, contact });
    } catch (error) {
      console.error('Create contact error:', error);
      return res.status(500).json({ error: 'Failed to create contact' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

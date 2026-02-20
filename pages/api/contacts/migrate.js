// pages/api/contacts/migrate.js
// POST - Migrate glossary entries to contacts

import { kv } from '@vercel/kv';
import { requireAuth, getUserName } from '../../../lib/auth';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const userName = await getUserName(req, res);
    const now = new Date().toISOString();

    // Fetch glossary entries
    const glossaryEntries = await kv.get('glossary') || [];
    const userGlossary = glossaryEntries.filter(e => e.userId === userId);

    if (userGlossary.length === 0) {
      return res.status(200).json({ success: true, migrated: 0, skipped: 0, message: 'No glossary entries to migrate' });
    }

    // Fetch existing contacts
    let allContacts = await kv.get('contacts') || [];
    const userContacts = allContacts.filter(c => c.userId === userId && !c.deleted);

    let migrated = 0;
    let skipped = 0;

    for (const entry of userGlossary) {
      // Skip if already migrated (check by glossary ID or exact name match)
      const alreadyMigrated = userContacts.some(c =>
        c.migratedFromGlossaryId === entry.id ||
        c.name.toLowerCase().trim() === entry.name.toLowerCase().trim()
      );

      if (alreadyMigrated) {
        skipped++;
        continue;
      }

      const contact = {
        id: `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${migrated}`,
        userId,
        name: entry.name,
        aliases: entry.aliases || [],
        email: '',
        phone: '',
        company: '',
        role: entry.role || '',
        team: entry.team || '',
        linkedInUrl: '',
        tags: [],
        projects: [],
        howWeMet: '',
        relationshipContext: '',
        notes: [],
        activity: [{
          id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'create',
          field: null,
          oldValue: null,
          newValue: 'migrated from glossary',
          user: userName,
          timestamp: now
        }],
        createdAt: entry.createdAt || now,
        updatedAt: now,
        deleted: false,
        deletedAt: null,
        migratedFromGlossaryId: entry.id
      };

      allContacts.push(contact);
      migrated++;
    }

    if (migrated > 0) {
      await kv.set('contacts', allContacts);
    }

    return res.status(200).json({
      success: true,
      migrated,
      skipped,
      message: `Migrated ${migrated} contact${migrated !== 1 ? 's' : ''}, skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}`
    });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Failed to migrate glossary entries' });
  }
}

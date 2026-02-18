// pages/api/glossary.js
// CRUD API for people glossary entries (stored in Vercel KV)

import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  // GET - List user's glossary entries
  if (req.method === 'GET') {
    try {
      const allEntries = await kv.get('glossary') || [];
      const entries = allEntries.filter(e => e.userId === userId);
      return res.status(200).json({ entries });
    } catch (error) {
      console.error('Get glossary error:', error);
      return res.status(500).json({ error: 'Failed to get glossary' });
    }
  }

  // POST - Add a new glossary entry
  if (req.method === 'POST') {
    try {
      const { name, aliases, role, team } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const normalizedAliases = Array.isArray(aliases)
        ? aliases.map(a => a.trim()).filter(Boolean)
        : typeof aliases === 'string'
          ? aliases.split(',').map(a => a.trim()).filter(Boolean)
          : [];

      const now = new Date().toISOString();
      const entry = {
        id: `g_${Date.now()}`,
        userId,
        name: name.trim(),
        aliases: normalizedAliases,
        role: role?.trim() || '',
        team: team?.trim() || '',
        createdAt: now,
        updatedAt: now
      };

      let allEntries = await kv.get('glossary') || [];
      allEntries.push(entry);
      await kv.set('glossary', allEntries);

      return res.status(200).json({ success: true, entry });
    } catch (error) {
      console.error('Add glossary entry error:', error);
      return res.status(500).json({ error: 'Failed to add glossary entry' });
    }
  }

  // PUT - Update a glossary entry
  if (req.method === 'PUT') {
    try {
      const { id, name, aliases, role, team } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Entry ID is required' });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const normalizedAliases = Array.isArray(aliases)
        ? aliases.map(a => a.trim()).filter(Boolean)
        : typeof aliases === 'string'
          ? aliases.split(',').map(a => a.trim()).filter(Boolean)
          : [];

      let allEntries = await kv.get('glossary') || [];
      const index = allEntries.findIndex(e => e.id === id && e.userId === userId);

      if (index === -1) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      allEntries[index] = {
        ...allEntries[index],
        name: name.trim(),
        aliases: normalizedAliases,
        role: role?.trim() || '',
        team: team?.trim() || '',
        updatedAt: new Date().toISOString()
      };

      await kv.set('glossary', allEntries);

      return res.status(200).json({ success: true, entry: allEntries[index] });
    } catch (error) {
      console.error('Update glossary entry error:', error);
      return res.status(500).json({ error: 'Failed to update glossary entry' });
    }
  }

  // DELETE - Remove a glossary entry
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Entry ID is required' });
      }

      let allEntries = await kv.get('glossary') || [];
      const entry = allEntries.find(e => e.id === id && e.userId === userId);

      if (!entry) {
        return res.status(404).json({ error: 'Entry not found' });
      }

      allEntries = allEntries.filter(e => e.id !== id);
      await kv.set('glossary', allEntries);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete glossary entry error:', error);
      return res.status(500).json({ error: 'Failed to delete glossary entry' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

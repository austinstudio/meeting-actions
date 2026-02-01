// pages/api/user-preferences.js
// Manage user preferences including lastSeenVersion for What's New modal

import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';
import { APP_VERSION } from '../../lib/features';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Return user's preferences
  if (req.method === 'GET') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const allPreferences = await kv.get('userPreferences') || [];
      const userPrefs = allPreferences.find(p => p.userId === userId);

      return res.status(200).json({
        lastSeenVersion: userPrefs?.lastSeenVersion ?? null,
        currentVersion: APP_VERSION
      });
    } catch (error) {
      console.error('Get user preferences error:', error);
      return res.status(500).json({ error: 'Failed to get preferences' });
    }
  }

  // PUT - Update user's preferences
  if (req.method === 'PUT') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { lastSeenVersion } = req.body;

      if (typeof lastSeenVersion !== 'number') {
        return res.status(400).json({ error: 'lastSeenVersion must be a number' });
      }

      let allPreferences = await kv.get('userPreferences') || [];

      // Find and update or create user's preferences
      const existingIndex = allPreferences.findIndex(p => p.userId === userId);
      const updatedPrefs = {
        userId,
        lastSeenVersion,
        updatedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        allPreferences[existingIndex] = updatedPrefs;
      } else {
        allPreferences.push(updatedPrefs);
      }

      await kv.set('userPreferences', allPreferences);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Update user preferences error:', error);
      return res.status(500).json({ error: 'Failed to update preferences' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

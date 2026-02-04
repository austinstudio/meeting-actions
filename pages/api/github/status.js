// pages/api/github/status.js
// Check GitHub connection status and disconnect

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  // GET - Check connection status
  if (req.method === 'GET') {
    try {
      const connections = await kv.get('githubConnections') || [];
      const connection = connections.find(c => c.userId === userId);

      if (connection) {
        return res.status(200).json({
          connected: true,
          username: connection.githubUsername,
          connectedAt: connection.connectedAt,
        });
      }

      return res.status(200).json({ connected: false });
    } catch (error) {
      console.error('GitHub status error:', error);
      return res.status(500).json({ error: 'Failed to check GitHub status' });
    }
  }

  // DELETE - Disconnect GitHub account
  if (req.method === 'DELETE') {
    try {
      let connections = await kv.get('githubConnections') || [];
      connections = connections.filter(c => c.userId !== userId);
      await kv.set('githubConnections', connections);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('GitHub disconnect error:', error);
      return res.status(500).json({ error: 'Failed to disconnect GitHub' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

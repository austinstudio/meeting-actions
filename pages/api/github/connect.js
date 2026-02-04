// pages/api/github/connect.js
// Initiates GitHub OAuth flow for connecting GitHub account

import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'GitHub OAuth not configured' });
  }

  // Build GitHub OAuth URL
  const baseUrl = process.env.NEXTAUTH_URL.replace(/\/$/, ''); // Remove trailing slash
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/github/callback`,
    scope: 'repo',
    state: userId, // Pass userId in state to associate on callback
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  res.redirect(githubAuthUrl);
}

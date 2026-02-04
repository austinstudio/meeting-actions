// pages/api/github/callback.js
// Handles GitHub OAuth callback and stores token

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state: userId } = req.query;

  if (!code || !userId) {
    return res.redirect('/?github_error=missing_params');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('GitHub OAuth error:', tokenData.error);
      return res.redirect('/?github_error=oauth_failed');
    }

    const accessToken = tokenData.access_token;

    // Get GitHub username
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const userData = await userResponse.json();

    if (!userData.login) {
      console.error('Failed to get GitHub user:', userData);
      return res.redirect('/?github_error=user_fetch_failed');
    }

    // Store connection in KV
    let connections = await kv.get('githubConnections') || [];

    // Remove existing connection for this user if any
    connections = connections.filter(c => c.userId !== userId);

    // Add new connection
    connections.push({
      userId,
      githubToken: accessToken,
      githubUsername: userData.login,
      connectedAt: new Date().toISOString(),
    });

    await kv.set('githubConnections', connections);

    // Redirect back to app with success
    res.redirect('/?github_connected=true');
  } catch (error) {
    console.error('GitHub callback error:', error);
    res.redirect('/?github_error=callback_failed');
  }
}

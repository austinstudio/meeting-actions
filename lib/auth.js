// lib/auth.js
// Helper functions for authentication in API routes

import { getServerSession } from 'next-auth';
import { authOptions } from '../pages/api/auth/[...nextauth]';

// Get the current user's session in an API route
export async function getSession(req, res) {
  return await getServerSession(req, res, authOptions);
}

// Mobile / scripted clients: `Authorization: Bearer <token>`. Tokens map to a userId via the
// MOBILE_API_TOKENS env var, a JSON object {"<token>": "<userId>"}. Rotate by editing the env.
export function getBearerUserId(req) {
  const header = req.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const map = JSON.parse(process.env.MOBILE_API_TOKENS || '{}');
    return typeof map[token] === 'string' && map[token] ? map[token] : null;
  } catch (e) {
    console.error('MOBILE_API_TOKENS is not valid JSON');
    return null;
  }
}

// Get the current user's ID, or null if not authenticated (session cookie first, then bearer token)
export async function getUserId(req, res) {
  const session = await getSession(req, res);
  if (session?.user?.id) return session.user.id;
  return getBearerUserId(req);
}

// Require authentication - returns user ID or sends 401 response
export async function requireAuth(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return userId;
}

// Get the current user's display name (first name)
export async function getUserName(req, res) {
  const session = await getSession(req, res);
  return session?.user?.name?.split(' ')[0] || 'Unknown';
}

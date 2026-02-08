// lib/auth.js
// Helper functions for authentication in API routes

import { getServerSession } from 'next-auth';
import { authOptions } from '../pages/api/auth/[...nextauth]';

// Get the current user's session in an API route
export async function getSession(req, res) {
  return await getServerSession(req, res, authOptions);
}

// Get the current user's ID, or null if not authenticated
export async function getUserId(req, res) {
  const session = await getSession(req, res);
  return session?.user?.id || null;
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

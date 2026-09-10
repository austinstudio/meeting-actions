// pages/api/pebble/device.js — POST { token, environment } registers the phone for silent pushes; DELETE { token } forgets it.
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { registerDevice, removeDevice, isValidDeviceToken, apnsConfig } from '../../../lib/apns.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await requireAuth(req, res);
  if (!userId) return;
  const { token, environment, platform } = req.body || {};
  if (!isValidDeviceToken(token)) return res.status(400).json({ error: 'Bad device token' });
  try {
    if (req.method === 'DELETE') {
      const remaining = await removeDevice(kv, userId, token.toLowerCase());
      return res.status(200).json({ ok: true, devices: remaining });
    }
    const devices = await registerDevice(kv, userId, { token: token.toLowerCase(), environment, platform });
    return res.status(200).json({ ok: true, devices, pushConfigured: Boolean(apnsConfig()) });
  } catch (error) {
    console.error('pebble/device error:', error);
    return res.status(500).json({ error: 'Failed to update device' });
  }
}

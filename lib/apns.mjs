// lib/apns.mjs
// Pushes to the Quick Notes phone app so a Pebble memo is pulled within seconds instead of waiting for the
// app to be opened. Visible, high-priority alerts (iOS held silent pushes for minutes on a locked phone);
// the alert also carries content-available so the app wakes, pulls, files, then replaces the banner with
// per-task notifications that offer triage actions. Token-based APNs auth (ES256 JWT from a .p8 key), HTTP/2
// via Node's http2 module (fetch cannot speak HTTP/2). No dependencies.
//
// Env: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (PEM; "\n" escapes accepted), APNS_BUNDLE_ID (default
// design.usdc.quicknotes). Absent → pushes are skipped and the phone still pulls on foreground.
//
// KV: pebble:devices:<userId> → [{ token, environment: 'development'|'production', platform, updatedAt }]

import crypto from 'node:crypto';
import http2 from 'node:http2';

export const DEFAULT_BUNDLE_ID = 'design.usdc.quicknotes';
export const MAX_DEVICES = 10;
export const devicesKey = (userId) => `pebble:devices:${userId}`;

const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' };

export function apnsConfig(env = process.env) {
  const keyId = (env.APNS_KEY_ID || '').trim();
  const teamId = (env.APNS_TEAM_ID || '').trim();
  const privateKey = (env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const bundleId = (env.APNS_BUNDLE_ID || DEFAULT_BUNDLE_ID).trim();
  if (!keyId || !teamId || !privateKey) return null;
  return { keyId, teamId, privateKey, bundleId };
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** APNs provider token: ES256 JWT, valid for up to an hour (Apple rejects tokens older than 60 min). */
export function buildProviderJWT({ keyId, teamId, privateKey, now = Date.now() }) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: Math.floor(now / 1000) }));
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(signature)}`;
}

/** Silent push (tests / diagnostics). */
export function backgroundPayload(reason = 'pebble-memo', extra = {}) {
  return { aps: { 'content-available': 1 }, reason, ...extra };
}

/**
 * Visible "filing…" alert for a memo. content-available wakes the app; the app removes this notification
 * (identifier = apns-collapse-id = memo id) once the memo is filed and posts the task notifications.
 */
export function memoAlertPayload(memo, reason = 'pebble-memo') {
  const text = (memo?.transcription || '').replace(/\s+/g, ' ').trim();
  const body = text ? `“${text.length > 110 ? text.slice(0, 107).trimEnd() + '…' : text}”` : 'Filing your memo…';
  return {
    aps: {
      alert: { title: 'Pebble memo', subtitle: 'Filing on your iPhone…', body },
      sound: 'default',
      'thread-id': 'pebble',
      category: 'PEBBLE_MEMO',
      'content-available': 1,
    },
    reason,
    memoId: memo?.id ?? null,
  };
}

export function isValidDeviceToken(token) { return typeof token === 'string' && /^[0-9a-f]{64,200}$/i.test(token); }

/** APNs said this token is dead for good → stop pushing to it. */
export function shouldForgetDevice(status, reason) {
  if (status === 410) return true;
  return status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason);
}

/**
 * One background push over HTTP/2. Resolves { status, reason, apnsId }; never throws for HTTP errors,
 * rejects only on connection failure/timeout.
 */
export function sendBackgroundPush({ token, environment = 'production', bundleId, jwt, payload, timeoutMs = 4000, connect = http2.connect,
                                     pushType = 'background', priority = '5', collapseId = null }) {
  const host = HOSTS[environment] || HOSTS.production;
  return new Promise((resolve, reject) => {
    const client = connect(host);
    const timer = setTimeout(() => { client.close(); reject(new Error(`APNs timeout after ${timeoutMs} ms`)); }, timeoutMs);
    client.on('error', (err) => { clearTimeout(timer); reject(err); });
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': pushType,
      'apns-priority': priority,
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      ...(collapseId ? { 'apns-collapse-id': String(collapseId).slice(0, 64) } : {}),
      'content-type': 'application/json',
    });
    let status = 0, apnsId = null, body = '';
    req.on('response', (headers) => { status = Number(headers[':status']); apnsId = headers['apns-id'] || null; });
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      clearTimeout(timer); client.close();
      let reason = null;
      if (body) { try { reason = JSON.parse(body).reason || null; } catch { reason = body.slice(0, 80); } }
      resolve({ status, reason, apnsId });
    });
    req.on('error', (err) => { clearTimeout(timer); client.close(); reject(err); });
    req.end(JSON.stringify(payload));
  });
}

/** Remember a phone. Same token → refreshed in place. Newest last, capped. */
export async function registerDevice(kv, userId, { token, environment, platform = 'ios' }) {
  const devices = ((await kv.get(devicesKey(userId))) || []).filter(d => d.token !== token);
  devices.push({ token, environment: environment === 'development' ? 'development' : 'production', platform, updatedAt: new Date().toISOString() });
  await kv.set(devicesKey(userId), devices.slice(-MAX_DEVICES));
  return devices.length;
}

export async function removeDevice(kv, userId, token) {
  const devices = ((await kv.get(devicesKey(userId))) || []).filter(d => d.token !== token);
  await kv.set(devicesKey(userId), devices);
  return devices.length;
}

/**
 * Wake every registered phone for `userId`. Returns { sent, failed, forgotten, skipped } and never throws.
 * `send` is injectable for tests.
 */
export async function notifyDevices(kv, userId, { reason = 'pebble-memo', memo = null, config = apnsConfig(), send = sendBackgroundPush, log = console } = {}) {
  const summary = { sent: 0, failed: 0, forgotten: 0, skipped: null };
  if (!config) { summary.skipped = 'APNs not configured'; return summary; }
  const devices = (await kv.get(devicesKey(userId))) || [];
  if (devices.length === 0) { summary.skipped = 'no devices'; return summary; }
  const jwt = buildProviderJWT(config);
  // A memo → visible alert at priority 10 (delivered on a locked phone); otherwise a silent nudge.
  const payload = memo ? memoAlertPayload(memo, reason) : backgroundPayload(reason);
  const delivery = memo ? { pushType: 'alert', priority: '10', collapseId: memo.id } : { pushType: 'background', priority: '5', collapseId: null };
  for (const device of devices) {
    try {
      const result = await send({ token: device.token, environment: device.environment, bundleId: config.bundleId, jwt, payload, ...delivery });
      if (result.status === 200) { summary.sent++; continue; }
      summary.failed++;
      log.warn?.(`APNs ${result.status} ${result.reason || ''} for ${device.environment} device …${device.token.slice(-8)}`);
      if (shouldForgetDevice(result.status, result.reason)) { await removeDevice(kv, userId, device.token); summary.forgotten++; }
    } catch (err) {
      summary.failed++;
      log.warn?.(`APNs send failed for …${device.token.slice(-8)}: ${err.message}`);
    }
  }
  return summary;
}

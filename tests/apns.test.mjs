import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildProviderJWT, backgroundPayload, shouldForgetDevice, isValidDeviceToken, registerDevice, removeDevice, notifyDevices, apnsConfig, devicesKey } from '../lib/apns.mjs';

class FakeKV { values = new Map(); async get(k) { return this.values.has(k) ? JSON.parse(this.values.get(k)) : null; } async set(k, v) { this.values.set(k, JSON.stringify(v)); } async del(k) { this.values.delete(k); } }
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const config = { keyId: 'ABC123DEFG', teamId: 'DVYM7LF4Z2', privateKey: pem, bundleId: 'design.usdc.quicknotes' };
const TOKEN_A = 'a'.repeat(64), TOKEN_B = 'b'.repeat(64);

test('provider JWT is ES256 with kid/iss/iat and verifies against the key', () => {
  const jwt = buildProviderJWT({ ...config, now: 1_789_000_000_000 });
  const [h, c, s] = jwt.split('.');
  const decode = (x) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'ABC123DEFG' });
  assert.deepEqual(decode(c), { iss: 'DVYM7LF4Z2', iat: 1_789_000_000 });
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  assert.equal(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig), true);
});

test('config reads env and unescapes the PEM; missing pieces → null', () => {
  assert.equal(apnsConfig({}), null);
  const cfg = apnsConfig({ APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----' });
  assert.equal(cfg.privateKey, '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----');
  assert.equal(cfg.bundleId, 'design.usdc.quicknotes');
});

test('payload, token validation and forget rules', () => {
  assert.deepEqual(backgroundPayload(), { aps: { 'content-available': 1 }, reason: 'pebble-memo' });
  assert.equal(isValidDeviceToken(TOKEN_A), true);
  assert.equal(isValidDeviceToken('short'), false);
  assert.equal(isValidDeviceToken('z'.repeat(64)), false);
  assert.equal(shouldForgetDevice(410, 'Unregistered'), true);
  assert.equal(shouldForgetDevice(400, 'BadDeviceToken'), true);
  assert.equal(shouldForgetDevice(400, 'PayloadEmpty'), false);
  assert.equal(shouldForgetDevice(503, null), false);
});

test('device registry dedupes by token, keeps environment, caps size', async () => {
  const kv = new FakeKV();
  await registerDevice(kv, 'u1', { token: TOKEN_A, environment: 'development' });
  await registerDevice(kv, 'u1', { token: TOKEN_B, environment: 'production' });
  await registerDevice(kv, 'u1', { token: TOKEN_A, environment: 'development' });
  const devices = await kv.get(devicesKey('u1'));
  assert.deepEqual(devices.map(d => [d.token, d.environment]), [[TOKEN_B, 'production'], [TOKEN_A, 'development']]);
  await removeDevice(kv, 'u1', TOKEN_B);
  assert.deepEqual((await kv.get(devicesKey('u1'))).map(d => d.token), [TOKEN_A]);
  for (let i = 0; i < 12; i++) await registerDevice(kv, 'u2', { token: String(i).repeat(64).slice(0, 64), environment: 'production' });
  assert.equal((await kv.get(devicesKey('u2'))).length, 10);
});

test('notifyDevices sends to each device on its environment host, forgets dead tokens, skips when unconfigured', async () => {
  const kv = new FakeKV();
  assert.deepEqual(await notifyDevices(kv, 'u1', { config: null }), { sent: 0, failed: 0, forgotten: 0, skipped: 'APNs not configured' });
  assert.equal((await notifyDevices(kv, 'u1', { config })).skipped, 'no devices');
  await registerDevice(kv, 'u1', { token: TOKEN_A, environment: 'development' });
  await registerDevice(kv, 'u1', { token: TOKEN_B, environment: 'production' });
  const calls = [];
  const send = async ({ token, environment, bundleId, jwt, payload }) => {
    calls.push({ token, environment, bundleId, hasJwt: jwt.split('.').length === 3, payload });
    return token === TOKEN_B ? { status: 410, reason: 'Unregistered' } : { status: 200, reason: null };
  };
  const summary = await notifyDevices(kv, 'u1', { config, send, log: { warn() {} } });
  assert.deepEqual(summary, { sent: 1, failed: 1, forgotten: 1, skipped: null });
  assert.deepEqual(calls.map(c => [c.token, c.environment, c.bundleId, c.hasJwt]), [[TOKEN_A, 'development', 'design.usdc.quicknotes', true], [TOKEN_B, 'production', 'design.usdc.quicknotes', true]]);
  assert.deepEqual(calls[0].payload, { aps: { 'content-available': 1 }, reason: 'pebble-memo' });
  assert.deepEqual((await kv.get(devicesKey('u1'))).map(d => d.token), [TOKEN_A], 'the 410 token is gone');
  const flaky = await notifyDevices(kv, 'u1', { config, send: async () => { throw new Error('ECONNRESET'); }, log: { warn() {} } });
  assert.deepEqual(flaky, { sent: 0, failed: 1, forgotten: 0, skipped: null });
});

// pages/api/pebble-webhook.js
// Receiver for the Pebble Index "Hold & Talk" webhook (Pebble app → Settings → Advanced → Webhook).
//
// Wire format (CoreApp 1.11, observed 2026-09-09): one multipart/form-data POST per memo with parts
// `audio` (m4a, audio/mp4), `transcription` (Pebble's on-phone transcript), `recordedAt` (epoch ms),
// `client` = ring; test events carry `test=true`. Headers x-index-trigger, x-audio-size.
//
// Path 2: the memo is stored (lib/pebble-memos.mjs) for the Quick Notes phone app to pull, parse on-device
// and post as a structured capture; nothing is imported here. A shape summary of the last 10 deliveries is
// kept under pebble:webhook:runs:<userId> for diagnostics (GET returns them, DELETE clears). Audio bytes
// never appear in the summaries.
//
// Auth: `Authorization: Bearer <token>` header configured in the Pebble app (the same bearer the phone app
// uses) or a session cookie; both resolve to the owner's userId via lib/auth.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';
import { withIngestAlert } from '../../lib/alerts';
import { summarizeDelivery, appendRun, parseMultipart, MAX_BODY_BYTES } from '../../lib/pebble-webhook.mjs';
import { buildMemo, storeMemo } from '../../lib/pebble-memos.mjs';
import { notifyDevices } from '../../lib/apns.mjs';

export const config = { api: { bodyParser: false } };

const RUNS_KEY = (userId) => `pebble:webhook:runs:${userId}`;

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method === 'GET') {
    const runs = (await kv.get(RUNS_KEY(userId))) || [];
    return res.status(200).json({ runs, count: runs.length });
  }
  if (req.method === 'DELETE') {
    await kv.del(RUNS_KEY(userId));
    return res.status(200).json({ ok: true, cleared: true });
  }
  if (req.method !== 'POST' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try { body = await readBody(req); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const summary = summarizeDelivery({ method: req.method, url: req.url, headers: req.headers, body });
  const runs = appendRun((await kv.get(RUNS_KEY(userId))) || [], summary);
  await kv.set(RUNS_KEY(userId), runs);

  const parts = summary.kind === 'multipart' ? parseMultipart(body, summary.contentType) : null;
  if (!parts) {
    console.log(`Pebble webhook: ignored ${summary.kind} ${summary.bytes} bytes (${summary.contentType || 'no content-type'})`);
    return res.status(200).json({ ok: true, skipped: true, reason: `unsupported body: ${summary.kind}` });
  }
  const built = buildMemo({ parts, headers: req.headers, receivedAt: summary.receivedAt });
  if (built.skip) {
    console.log(`Pebble webhook: skipped (${built.skip})`);
    return res.status(200).json({ ok: true, skipped: true, reason: built.skip });
  }
  const stored = await storeMemo(kv, userId, built.memo, built.audioBody);
  console.log(`Pebble webhook: memo ${built.memo.id} ${stored ? 'queued' : 'duplicate'} (${built.memo.audio?.bytes ?? 0} bytes audio, ${built.memo.transcription.length} chars)`);
  // Wake the phone so it pulls now. Awaited (Vercel may freeze the function after the response) but never fatal.
  const push = stored ? await notifyDevices(kv, userId) : null;
  if (push) console.log(`Pebble webhook: push sent=${push.sent} failed=${push.failed} forgotten=${push.forgotten}${push.skipped ? ` (${push.skipped})` : ''}`);
  return res.status(200).json({ ok: true, memo: { id: built.memo.id, queued: stored, duplicate: !stored }, push });
}

export default withIngestAlert('pebble-webhook', handler);

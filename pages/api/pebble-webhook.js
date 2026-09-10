// pages/api/pebble-webhook.js
// Receiver for the Pebble Index "Hold & Talk" webhook (Pebble app → Settings → Advanced → Webhook).
//
// Discovery phase (Sep 2026): records a shape summary of every delivery under KV `pebble:webhook:runs`
// (last 10) — headers minus auth, content type, JSON keys with long/base64 values redacted, multipart part
// list with sizes and audio magic bytes, full transcription text. Never stores audio. GET returns the runs.
// Once the format is known this route becomes the real ingest (path 2: store audio, wake the phone) at the
// same URL, so the Pebble app keeps its configuration.
//
// Auth: `Authorization: Bearer <token>` header configured in the Pebble app (the same bearer the phone app
// uses) or a session cookie; both resolve to the owner's userId via lib/auth.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../lib/auth';
import { withIngestAlert } from '../../lib/alerts';
import { summarizeDelivery, appendRun, MAX_BODY_BYTES } from '../../lib/pebble-webhook.mjs';

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
  console.log(`Pebble webhook: ${summary.kind} ${summary.bytes} bytes (${summary.contentType || 'no content-type'})`);

  return res.status(200).json({
    ok: true,
    received: { kind: summary.kind, bytes: summary.bytes, contentType: summary.contentType, keys: summary.keys ?? summary.parts?.map(p => p.name) ?? null },
    note: 'Discovery mode: shape recorded, nothing imported yet.',
  });
}

export default withIngestAlert('pebble-webhook', handler);

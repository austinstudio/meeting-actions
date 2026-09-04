#!/usr/bin/env node
/**
 * One-time migration: move meeting transcripts out of the `meetings` KV blob
 * into `meeting:<id>:transcript` keys (see lib/meeting-store.js).
 *
 *   node scripts/migrate-transcripts.mjs            # dry run: report only, writes nothing
 *   node scripts/migrate-transcripts.mjs --apply    # back up, then migrate
 *
 * Reads KV_REST_API_URL / KV_REST_API_TOKEN from .env.local (or the environment).
 * Always writes a full JSON backup of the current blob to scripts/kv-backup-meetings-<ts>.json
 * before touching anything in --apply mode.
 */
import { createClient } from '@vercel/kv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Minimal .env.local loader (no dotenv dependency in this repo).
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error('Missing KV_REST_API_URL / KV_REST_API_TOKEN');
  process.exit(1);
}
const kv = createClient({ url, token });
const apply = process.argv.includes('--apply');

const meetings = (await kv.get('meetings')) || [];
const before = Buffer.byteLength(JSON.stringify(meetings));
const withTranscript = meetings.filter(m => typeof m.transcript === 'string' && m.transcript.length > 0);
const transcriptBytes = withTranscript.reduce((n, m) => n + Buffer.byteLength(m.transcript), 0);

const stripped = meetings.map(m => {
  if (typeof m.transcript !== 'string') return m;
  const { transcript, ...meta } = m;
  return { ...meta, hasTranscript: transcript.length > 0, transcriptLength: transcript.length };
});
const after = Buffer.byteLength(JSON.stringify(stripped));

console.log(`meetings: ${meetings.length} records, ${withTranscript.length} with inline transcripts`);
console.log(`blob size: ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB (transcripts ${(transcriptBytes / 1e6).toFixed(2)} MB move to per-meeting keys)`);

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to migrate.');
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(here, `kv-backup-meetings-${ts}.json`);
fs.writeFileSync(backupPath, JSON.stringify(meetings));
console.log(`backup written: ${backupPath}`);

// 1. Write every transcript to its own key (idempotent; safe to re-run).
let written = 0;
for (const m of withTranscript) {
  await kv.set(`meeting:${m.id}:transcript`, { text: m.transcript });
  written++;
  if (written % 25 === 0) console.log(`  ${written}/${withTranscript.length} transcripts written`);
}
console.log(`transcripts written: ${written}`);

// 2. Verify a sample before shrinking the blob.
for (const m of withTranscript.slice(0, 5)) {
  const back = await kv.get(`meeting:${m.id}:transcript`);
  if (!back || back.text !== m.transcript) {
    console.error(`verification failed for ${m.id}; aborting before rewriting meetings`);
    process.exit(2);
  }
}

// 3. Replace the blob with metadata only.
await kv.set('meetings', stripped);
const check = (await kv.get('meetings')) || [];
console.log(`meetings blob rewritten: ${check.length} records, ${(Buffer.byteLength(JSON.stringify(check)) / 1e6).toFixed(2)} MB`);
console.log('done');

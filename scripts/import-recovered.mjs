#!/usr/bin/env node
/**
 * import-recovered.mjs — add digest-recovered tasks back into the live KV `tasks`,
 * skipping anything already present.
 *
 * Input:  scripts/digests-parsed.json  (from parse-digests.mjs)
 * Target: the `tasks` KV blob.
 *
 * SAFETY:
 *   - Dry run by default. Nothing is written without --commit.
 *   - Before reading, writes a full snapshot of current `tasks`+`meetings` to
 *     scripts/kv-backup-<timestamp>.json (runs even in dry-run) — your backup.
 *   - Dedupes parsed tasks against ALL current tasks for the user (by normalized
 *     text), so nothing on your board is duplicated and nothing you deleted before
 *     the cutoff gets re-added if it still exists.
 *   - Recovered tasks are flagged { recovered: true }, tagged 'recovered', and get
 *     id prefix "t_rec_" so you can filter, review, or bulk-remove them later.
 *
 * WHAT IT RESTORES per task: text, priority (high), type (follow-up)+person, owner,
 * due date, and status:done where the digest showed it. Non-done tasks land in
 * 'uncategorized' so you can re-triage. Column placement (todo/waiting/personal/etc.)
 * was never in the digests and is not restored.
 *
 * USAGE:
 *   npm install
 *   vercel env pull .env.local      # KV_REST_API_URL, KV_REST_API_TOKEN, INBOUND_EMAIL_USER_ID
 *   node scripts/import-recovered.mjs            # DRY RUN
 *   node scripts/import-recovered.mjs --commit   # apply
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { kv } from '@vercel/kv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const rawLine of readFileSync(p, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(key in process.env)) process.env[key] = val;
    }
  }
}
loadEnv();
for (const n of ['KV_REST_API_URL', 'KV_REST_API_TOKEN']) {
  if (!process.env[n]) { console.error(`\n✖ Missing env var ${n}. Run \`vercel env pull .env.local\`.\n`); process.exit(1); }
}

const normKey = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const MONTHS = { January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11 };
function seenToISO(seenDates) {
  // "Weekday, Month Day" (year assumed 2026). Return earliest as ISO at noon UTC.
  let best = null;
  for (const s of seenDates || []) {
    const m = s.match(/,\s+(\w+)\s+(\d+)/);
    if (!m || !(m[1] in MONTHS)) continue;
    const d = new Date(Date.UTC(2026, MONTHS[m[1]], +m[2], 12, 0, 0));
    if (!best || d < best) best = d;
  }
  return best ? best.toISOString() : null;
}

async function main() {
  console.log(`\n=== Import Recovered Tasks (${COMMIT ? 'COMMIT' : 'DRY RUN'}) ===\n`);

  const meetings = (await kv.get('meetings')) || [];
  const tasks = (await kv.get('tasks')) || [];

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(__dirname, `kv-backup-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({ savedAt: new Date().toISOString(), meetings, tasks }, null, 2));
  console.log(`✓ KV snapshot written to ${backupPath}`);
  console.log(`  current tasks: ${tasks.length}, meetings: ${meetings.length}`);

  // Resolve target userId: env override, else the majority userId among current tasks.
  let userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) {
    const counts = {};
    tasks.forEach(t => { if (t.userId) counts[t.userId] = (counts[t.userId] || 0) + 1; });
    userId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }
  if (!userId) { console.error('\n✖ Could not determine target userId. Set INBOUND_EMAIL_USER_ID in .env.local.\n'); process.exit(1); }
  console.log(`  target userId: ${userId}  ${process.env.INBOUND_EMAIL_USER_ID ? '(from env)' : '(inferred from current tasks — verify!)'}\n`);

  const parsed = JSON.parse(readFileSync(join(__dirname, 'digests-parsed.json'), 'utf8'));

  // Dedupe against ALL current tasks for this user (any status, incl. deleted).
  const existing = new Set(tasks.filter(t => t.userId === userId).map(t => normKey(t.task || '')));

  const toAdd = [];
  let skipped = 0;
  parsed.forEach((p, i) => {
    if (existing.has(normKey(p.task))) { skipped++; return; }
    const createdAt = seenToISO(p.seenDates) || new Date().toISOString();
    toAdd.push({
      id: `t_rec_${stamp}_${i}`,
      userId,
      meetingId: null,
      task: p.task,
      owner: p.owner || 'Me',
      dueDate: p.dueDate || null,
      status: p.status === 'done' ? 'done' : 'uncategorized',
      type: p.type || 'action',
      priority: p.priority || 'medium',
      person: p.person || null,
      context: p.source ? `Recovered from digest. Source: ${p.source}` : 'Recovered from ntfy digest history',
      tags: ['recovered'],
      recovered: true,
      recoveredAt: new Date().toISOString(),
      createdAt,
      activity: [{
        id: `act_rec_${stamp}_${i}`,
        type: 'created',
        source: p.source || 'ntfy digest recovery',
        timestamp: new Date().toISOString(),
        note: `Recovered from digest history; appeared on ${p.seenDates?.length || 0} day(s)`,
      }],
    });
  });

  console.log(`Parsed tasks:        ${parsed.length}`);
  console.log(`Already in DB (skip): ${skipped}`);
  console.log(`New to add:          ${toAdd.length}`);
  console.log(`  → to 'done':          ${toAdd.filter(t => t.status === 'done').length}`);
  console.log(`  → to 'uncategorized': ${toAdd.filter(t => t.status === 'uncategorized').length}`);
  console.log(`\nSample of what would be added:`);
  toAdd.slice(0, 12).forEach(t => console.log(`  • [${t.priority}/${t.type}${t.status === 'done' ? '/done' : ''}] ${t.task}`));
  if (toAdd.length > 12) console.log(`  ... and ${toAdd.length - 12} more`);

  writeFileSync(join(__dirname, `recovered-to-add-${stamp}.json`), JSON.stringify(toAdd, null, 2));
  console.log(`\n✓ Full add-set written to scripts/recovered-to-add-${stamp}.json`);

  if (!COMMIT) { console.log(`\nDRY RUN — no KV changes. Review, then re-run with --commit.\n`); return; }
  if (toAdd.length === 0) { console.log(`\nNothing to add.\n`); return; }

  const updated = [...toAdd, ...tasks];
  await kv.set('tasks', updated);
  console.log(`\n✓ COMMITTED. tasks blob is now ${updated.length} (was ${tasks.length}).`);
  console.log(`  Recovered tasks: id prefix "t_rec_", tag 'recovered'. Filter/search 'recovered' to review them.\n`);
}

main().catch(err => { console.error('\n✖ Import failed:', err); process.exit(1); });

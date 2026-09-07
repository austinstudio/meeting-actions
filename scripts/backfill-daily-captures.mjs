#!/usr/bin/env node
/**
 * One-time backfill: fold the old one-meeting-per-memo Quick Notes captures into the
 * per-day meetings introduced on 2026-09-07 ("Quick captures — Sep 5, 2026"), retarget
 * their tasks, tag those tasks 'watch', and build each day's transcript log.
 *
 *   node scripts/backfill-daily-captures.mjs                 # dry run: prints the plan, writes nothing
 *   node scripts/backfill-daily-captures.mjs --apply         # back up, then migrate
 *   node scripts/backfill-daily-captures.mjs --zone=America/Chicago   # clock times for transcript entries
 *
 * Reads KV_REST_API_URL / KV_REST_API_TOKEN from .env.local (or the environment). In --apply mode a full
 * JSON backup (meetings, tasks, affected transcripts) is written to scripts/kv-backup-captures-<ts>.json first.
 * Idempotent: re-running after a partial apply finishes the job.
 */
import { createClient } from '@vercel/kv';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateTasks } from '../lib/task-store.mjs';
import { dailyMeetingTitle, captureEntryText } from '../lib/capture-idempotency.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
if (!url || !token) { console.error('Missing KV_REST_API_URL / KV_REST_API_TOKEN'); process.exit(1); }
const kv = createClient({ url, token });
const apply = process.argv.includes('--apply');
const zone = (process.argv.find(a => a.startsWith('--zone=')) || '').slice(7) || Intl.DateTimeFormat().resolvedOptions().timeZone;
const hash = value => createHash('sha256').update(value).digest('hex');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDaily = id => typeof id === 'string' && id.startsWith('m_capture_day_');
const localDay = (iso, tz) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

const meetings = (await kv.get('meetings')) || [];
const tasks = (await kv.get('tasks')) || [];
const old = meetings.filter(m => m && m.source === 'quick-capture' && !isDaily(m.id));
const skipped = [];
const groups = new Map();   // dailyId → { userId, day, dailyId, old: [] }
for (const m of old) {
  const day = DAY.test(m.date || '') ? m.date : localDay(m.processedAt, zone);
  if (!m.userId || !day) { skipped.push(m.id); continue; }
  const dailyId = `m_capture_day_${hash(m.userId).slice(0, 16)}_${day}`;
  if (!groups.has(dailyId)) groups.set(dailyId, { userId: m.userId, day, dailyId, old: [] });
  groups.get(dailyId).old.push(m);
}
const oldIds = new Set(old.map(m => m.id));
const existingDaily = new Map(meetings.filter(m => isDaily(m?.id)).map(m => [m.id, m]));
const movedTasks = tasks.filter(t => oldIds.has(t.meetingId));
const untagged = tasks.filter(t => (oldIds.has(t.meetingId) || isDaily(t.meetingId)) && !(Array.isArray(t.tags) && t.tags.includes('watch')));

console.log(`${old.length} old capture meetings → ${groups.size} daily meetings (${[...groups.values()].filter(g => existingDaily.has(g.dailyId)).length} already exist); ` +
  `${movedTasks.length} tasks retargeted, ${untagged.length} tasks to tag 'watch'; zone ${zone}${skipped.length ? `; skipped ${skipped.length} without user/date: ${skipped.join(', ')}` : ''}`);
for (const g of [...groups.values()].sort((a, b) => a.day.localeCompare(b.day))) {
  console.log(`  ${g.day}  ${String(g.old.length).padStart(2)} memos, ${tasks.filter(t => g.old.some(m => m.id === t.meetingId)).length} tasks → ${dailyMeetingTitle(g.day)}${existingDaily.has(g.dailyId) ? ' (merge into existing)' : ''}`);
}
if (!groups.size && !untagged.length) { console.log('Nothing to do.'); process.exit(0); }
if (!apply) { console.log('\nDry run. Re-run with --apply to migrate.'); process.exit(0); }

// ---- backup ----
const transcripts = {};
for (const m of old) transcripts[m.id] = await kv.get(`meeting:${m.id}:transcript`);
for (const id of existingDaily.keys()) transcripts[id] = await kv.get(`meeting:${id}:transcript`);
const backup = path.join(here, `kv-backup-captures-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify({ meetings, tasks, transcripts }, null, 1));
console.log(`Backup written: ${backup}`);

// ---- 1. transcript logs (new keys or merged into today's existing log) ----
for (const g of groups.values()) {
  const entries = [];
  for (const m of [...g.old].sort((a, b) => String(a.processedAt).localeCompare(String(b.processedAt)))) {
    const text = transcripts[m.id]?.text ?? (typeof m.transcript === 'string' ? m.transcript : '');
    if (text.trim()) entries.push(captureEntryText(text.trim(), Date.parse(m.processedAt), zone));
  }
  const existingText = transcripts[g.dailyId]?.text;
  const log = [...entries, ...(existingText ? [existingText] : [])].join('\n\n');   // old memos precede today's live log
  g.log = log;
  await kv.set(`meeting:${g.dailyId}:transcript`, { text: log });
}

// ---- 2. meetings array: old records replaced in place by the day's record ----
const seenDaily = new Set();
const nextMeetings = [];
for (const m of meetings) {
  if (!oldIds.has(m?.id)) { nextMeetings.push(m); continue; }
  const g = [...groups.values()].find(x => x.old.some(o => o.id === m.id));
  if (!g || seenDaily.has(g.dailyId) || existingDaily.has(g.dailyId)) continue;
  seenDaily.add(g.dailyId);
  const title = dailyMeetingTitle(g.day);
  nextMeetings.push({
    id: g.dailyId, userId: g.userId, title, sourceFileName: 'Quick Notes', date: g.day, duration: null, participants: [],
    summary: `Voice memos captured with Quick Notes on ${title.replace('Quick captures — ', '')}.`,
    source: 'quick-capture', captureSource: 'watch',
    processedAt: g.old.map(o => o.processedAt).filter(Boolean).sort()[0] || new Date().toISOString(),
    hasTranscript: g.log.length > 0, transcriptLength: g.log.length, backfilledFrom: g.old.map(o => o.id),
  });
}
const bytes = Buffer.byteLength(JSON.stringify(nextMeetings));
if (bytes > 10 * 1024 * 1024 - 256 * 1024) throw new Error(`meetings would be ${bytes} bytes`);
await kv.set('meetings', nextMeetings);
console.log(`meetings: ${meetings.length} → ${nextMeetings.length}`);

// ---- 3. tasks: retarget + tag, under compare-and-set ----
const dailyFor = new Map();
for (const g of groups.values()) for (const o of g.old) dailyFor.set(o.id, g.dailyId);
const result = await updateTasks(kv, current => {
  let moved = 0, tagged = 0;
  const next = current.map(t => {
    let task = t;
    if (dailyFor.has(task.meetingId)) { task = { ...task, meetingId: dailyFor.get(task.meetingId) }; moved++; }
    if (isDaily(task.meetingId) && !(Array.isArray(task.tags) && task.tags.includes('watch'))) {
      task = { ...task, tags: [...(Array.isArray(task.tags) ? task.tags : []), 'watch'] }; tagged++;
    }
    return task;
  });
  return { tasks: next, moved, tagged };
});
console.log(`tasks: ${result.moved} retargeted, ${result.tagged} tagged`);

// ---- 4. old transcript keys ----
for (const id of oldIds) await kv.del(`meeting:${id}:transcript`);
console.log(`deleted ${oldIds.size} old transcript keys. Done.`);

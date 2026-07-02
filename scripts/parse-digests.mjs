#!/usr/bin/env node
/**
 * parse-digests.mjs — parse the full ntfy digest history into a deduped task set.
 *
 * Source: scripts/digests-raw.txt (produced by:
 *   pdftotext -layout "note backup.pdf" scripts/digests-raw.txt)
 *
 * The PDF wraps long task lines across several physical lines. We reconstruct the
 * logical bullet lines first (a bullet starts with leading whitespace; a wrapped
 * continuation starts at column 0), skip Google Keep note labels (B8, B9, ...),
 * then parse each digest section and merge duplicate tasks across sections/days.
 *
 * Output: scripts/digests-parsed.json — one entry per unique task with whatever
 * organization the digests captured (priority / follow-up+person / owner / due /
 * done). Pure parsing; does NOT touch KV.
 *
 *   node scripts/parse-digests.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = join(__dirname, 'digests-raw.txt');

const SECTIONS = ['OVERDUE', 'HIGH PRIORITY', 'FOLLOW-UPS', 'NEW', 'DONE'];
const SECTION_RE = new RegExp(`^(${SECTIONS.join('|')}) \\((\\d+)\\):\\s*$`);
const DATE_RE = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+\w+\s+\d+\s*$/;
const STATS_RE = /^(Active:|Inbox:|Imports:)/;
const LABEL_RE = /^B\d+\s*$/;            // Google Keep note labels
const MORE_RE = /^\.\.\.and (\d+) more$/;

// --- Pass 1: reconstruct logical lines from the wrapped PDF text ---
const rawLines = readFileSync(INPUT, 'utf8').split('\n');
const lines = [];              // normalized: headers as-is, bullets as "  <text>"
let buf = null;
const flush = () => { if (buf !== null) { lines.push('  ' + buf.replace(/\s+/g, ' ').trim()); buf = null; } };

for (const raw of rawLines) {
  const line = raw.replace(/\s+$/, '');
  const trimmed = line.trim();

  if (trimmed === '' || LABEL_RE.test(trimmed)) { flush(); continue; }
  if (DATE_RE.test(trimmed) || SECTION_RE.test(trimmed) || STATS_RE.test(trimmed)) {
    flush(); lines.push(trimmed); continue;
  }
  if (MORE_RE.test(trimmed)) { flush(); lines.push('  ' + trimmed); continue; }

  if (/^\s/.test(line)) { flush(); buf = trimmed; }   // leading space => new bullet
  else { buf = (buf === null ? '' : buf + ' ') + trimmed; }  // col 0 => continuation
}
flush();

// --- Pass 2: parse sections and merge tasks ---
function normKey(text) { return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

function stripTrailers(s) {
  let owner = null, dueDate = null, changed = true;
  while (changed) {
    changed = false;
    let m = s.match(/\s*\[([^\][]+)\]\s*$/);
    if (m) { owner = m[1].trim(); s = s.slice(0, m.index).trimEnd(); changed = true; continue; }
    m = s.match(/\s*\(due (\d{4}-\d{2}-\d{2})\)\s*$/);
    if (m) { dueDate = m[1]; s = s.slice(0, m.index).trimEnd(); changed = true; continue; }
  }
  return { text: s, owner, dueDate };
}

const tasks = new Map();
const dropped = {};
let curSection = null, curDate = null;

function ensure(key, text) {
  if (!tasks.has(key)) {
    tasks.set(key, {
      task: text, owner: 'Me', dueDate: null, priority: 'medium',
      type: 'action', person: null, status: 'uncategorized',
      overdue: false, source: null, seenDates: new Set(),
    });
  }
  return tasks.get(key);
}

for (const line of lines) {
  const t = line.trim();
  if (DATE_RE.test(t)) { curDate = t; curSection = null; continue; }
  const sm = t.match(SECTION_RE);
  if (sm) { curSection = sm[1]; continue; }
  if (STATS_RE.test(t)) continue;
  if (!curSection) continue;

  const mm = t.match(MORE_RE);
  if (mm) { dropped[curSection] = Math.max(dropped[curSection] || 0, +mm[1]); continue; }

  let text = t, meta = {};
  if (curSection === 'OVERDUE') {
    text = text.replace(/^\d+d late\s*-\s*/, '');
    const r = stripTrailers(text); text = r.text; meta = { owner: r.owner, overdue: true };
  } else if (curSection === 'HIGH PRIORITY') {
    const r = stripTrailers(text); text = r.text; meta = { owner: r.owner, dueDate: r.dueDate, priority: 'high' };
  } else if (curSection === 'FOLLOW-UPS') {
    const r = stripTrailers(text); text = r.text;
    const pm = text.match(/\sw\/\s(.+)$/);
    let person = null;
    if (pm) { person = pm[1].trim(); text = text.slice(0, pm.index).trimEnd(); }
    meta = { type: 'follow-up', person, dueDate: r.dueDate };
  } else if (curSection === 'NEW') {
    const fm = text.match(/\s\(from (.+)\)\s*$/);
    if (fm) { meta.source = fm[1].trim(); text = text.slice(0, fm.index).trimEnd(); }
  } else if (curSection === 'DONE') {
    meta = { status: 'done' };
  }

  const key = normKey(text);
  if (!key) continue;
  const rec = ensure(key, text);
  if (text.length > rec.task.length) rec.task = text;
  if (meta.owner && meta.owner !== 'Me') rec.owner = meta.owner;
  if (meta.dueDate) rec.dueDate = meta.dueDate;
  if (meta.priority === 'high') rec.priority = 'high';
  if (meta.type === 'follow-up') rec.type = 'follow-up';
  if (meta.person) rec.person = meta.person;
  if (meta.status === 'done') rec.status = 'done';
  if (meta.overdue) rec.overdue = true;
  if (meta.source && !rec.source) rec.source = meta.source;
  if (curDate) rec.seenDates.add(curDate);
}

const out = [...tasks.values()].map(t => ({ ...t, seenDates: [...t.seenDates] }));
writeFileSync(join(__dirname, 'digests-parsed.json'), JSON.stringify(out, null, 2));

const digestCount = lines.filter(l => DATE_RE.test(l.trim())).length;
console.log(`\nDigests parsed: ${digestCount}`);
console.log(`Unique tasks recovered: ${out.length}`);
console.log(`  high priority: ${out.filter(t => t.priority === 'high').length}`);
console.log(`  follow-ups:    ${out.filter(t => t.type === 'follow-up').length}`);
console.log(`  marked done:   ${out.filter(t => t.status === 'done').length}`);
console.log(`  overdue:       ${out.filter(t => t.overdue).length}`);
console.log(`  with due date: ${out.filter(t => t.dueDate).length}`);
console.log(`\n"...and N more" never shown in any digest (unrecoverable):`);
for (const s of SECTIONS) if (dropped[s]) console.log(`  ${s}: up to ${dropped[s]} hidden on the biggest day`);
console.log(`\nWrote scripts/digests-parsed.json`);

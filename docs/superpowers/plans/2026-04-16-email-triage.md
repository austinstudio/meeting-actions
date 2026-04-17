# Email Triage Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `/triage` page that lets the user run on-demand AI analysis on Outlook emails (written to Redis by the external extractor), then work through flagged follow-ups via Queue / Focus / Board view modes, with a Copy-to-Clipboard AI draft reply flow.

**Architecture:** A Pages Router page backed by four new API routes. Raw emails stay in `email:*` / `emails:by_date` keys (owned by the extractor). Our triage state lives in a new `email-triage:{userId}` KV key (object map keyed by `outlook_id`). AI work uses the existing Gemini setup (`@google/generative-ai`) — a classification prompt for bulk analysis and a draft-generation prompt per email.

**Tech Stack:** Next.js 14 Pages Router, `@vercel/kv`, `@google/generative-ai` (Gemini), NextAuth (`requireAuth`), Tailwind, `lucide-react`. No test framework is installed — verification is done via `npm run dev` + curl + browser.

**Testing approach:** The app has no automated test suite. Each task ends with a manual verification step: hit the endpoint with `curl` for API tasks, check the UI in the browser for component tasks. Do NOT introduce a test framework — follow the existing project convention.

**KV client note:** This plan uses `@vercel/kv` for consistency with every other API route in the codebase (`pages/api/contacts/**`, `pages/api/tasks/**`, `pages/api/meetings/**`, `pages/api/webhook.js`, etc.). Platform hooks may flag `@vercel/kv` as deprecated in favor of `@upstash/redis` — this is valid platform guidance, but migrating the KV client is a separate cross-cutting refactor that should not be bundled into this feature. New code here follows the existing pattern; the migration, if and when it happens, should touch every route at once.

**Spec:** `docs/superpowers/specs/2026-04-16-email-triage-design.md`

---

## Prerequisites (do once, before any task)

- [ ] Ensure `.env.local` has `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (shared with extractor), `GEMINI_API_KEY`, and NextAuth vars
- [ ] Run the extractor at least once so `email:*` keys exist in Redis: `cd ~/Downloads/GitHub/outlook-email-extractor && RUST_LOG=info cargo run` then `curl -X POST http://localhost:3001/api/extract -H 'Content-Type: application/json' -d '{"limit":20}'`
- [ ] Add `.superpowers/` to `.gitignore` (mockup files from brainstorming session)
- [ ] Start dev server: `npm run dev` (keep running; every UI task verifies here)
- [ ] Sign in to the app in the browser to establish a session cookie (used by curl tests via `-b cookies.txt` or by testing directly in the browser)

---

## Task 1: Triage utilities module

**Files:**
- Create: `lib/triage-utils.js`

Single helpers module for joining emails + triage records, sort order, and snooze-expiry logic. No external deps.

- [ ] **Step 1: Write the module**

```javascript
// lib/triage-utils.js
// Shared helpers for the email triage feature.

export const DEFAULT_TRIAGE = {
  priority: 'low',
  needsFollowUp: false,
  insight: '',
  suggestedAction: '',
  deadlineDetected: null,
  triageState: 'fyi_only',
  snoozeUntil: null,
  linkedTaskId: null,
  analyzedAt: null
};

// Priority weight for sorting (higher = more urgent)
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

// True if snoozeUntil is set and still in the future.
export function isSnoozed(triage) {
  if (!triage?.snoozeUntil) return false;
  return new Date(triage.snoozeUntil) > new Date();
}

// Waiting days since the email was sent.
export function waitingDays(email) {
  if (!email?.sent_at) return 0;
  const sent = new Date(email.sent_at);
  const now = new Date();
  return Math.max(0, Math.floor((now - sent) / (1000 * 60 * 60 * 24)));
}

// Sort comparator: priority desc, then waiting days desc, then sent_at desc.
export function compareForQueue(a, b) {
  const aP = PRIORITY_WEIGHT[a.triage?.priority] || 0;
  const bP = PRIORITY_WEIGHT[b.triage?.priority] || 0;
  if (aP !== bP) return bP - aP;
  const aW = waitingDays(a);
  const bW = waitingDays(b);
  if (aW !== bW) return bW - aW;
  const aT = a.sent_at ? new Date(a.sent_at).getTime() : 0;
  const bT = b.sent_at ? new Date(b.sent_at).getTime() : 0;
  return bT - aT;
}

// Visibility predicates for view modes.
export function isInQueue(row) {
  const t = row.triage;
  if (!t) return false;
  if (t.triageState !== 'needs_reply') return false;
  if (isSnoozed(t)) return false;
  return true;
}

export function isOnBoard(row) {
  const t = row.triage;
  if (!t) return false;
  return t.triageState !== 'dismissed';
}

// Short body snippet for card preview (~200 chars, collapse whitespace).
export function bodySnippet(body, maxLen = 200) {
  if (!body) return '';
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + '…';
}

// Compute stats for the header.
export function computeStats(rows) {
  const stats = { total: rows.length, analyzed: 0, needsReply: 0, waitingOn: 0, fyiOnly: 0, done: 0 };
  for (const r of rows) {
    const t = r.triage;
    if (!t) continue;
    stats.analyzed += 1;
    if (t.triageState === 'needs_reply' && !isSnoozed(t)) stats.needsReply += 1;
    else if (t.triageState === 'waiting_on') stats.waitingOn += 1;
    else if (t.triageState === 'fyi_only') stats.fyiOnly += 1;
    else if (t.triageState === 'done') stats.done += 1;
  }
  return stats;
}
```

- [ ] **Step 2: Manual sanity check in a Node REPL**

Run: `node -e "const u = require('./lib/triage-utils.js'); console.log(u.waitingDays({sent_at: new Date(Date.now() - 3*86400000).toISOString()}));"`
Expected: `3`

- [ ] **Step 3: Commit**

```bash
git add lib/triage-utils.js
git commit -m "feat(triage): add utility module for email triage helpers"
```

---

## Task 2: GET /api/triage — list emails joined with triage records

**Files:**
- Create: `pages/api/triage/index.js`

Reads all `email:*` keys via the `emails:by_date` sorted set, reads the `email-triage:{userId}` map, joins them, filters by query params, and returns rows + stats.

- [ ] **Step 1: Write the handler**

```javascript
// pages/api/triage/index.js
// GET /api/triage — returns emails joined with user-specific triage records.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { compareForQueue, computeStats, isInQueue, isOnBoard, isSnoozed } from '../../../lib/triage-utils';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const { mode = 'queue', priority = 'all', sender = '', minWaitDays = '0' } = req.query;

    // 1. Pull email IDs in date order (newest first). zrange with rev=true.
    const ids = await kv.zrange('emails:by_date', 0, -1, { rev: true });
    if (!ids || ids.length === 0) {
      return res.status(200).json({ emails: [], stats: { total: 0, analyzed: 0, needsReply: 0, waitingOn: 0, fyiOnly: 0, done: 0 } });
    }

    // 2. Batch fetch emails.
    const keys = ids.map(id => `email:${id}`);
    const emails = await kv.mget(...keys);

    // 3. Fetch triage map for this user.
    const triageMap = (await kv.get(`email-triage:${userId}`)) || {};

    // 4. Join.
    const rows = emails
      .filter(Boolean)
      .map(e => ({ ...e, triage: triageMap[e.outlook_id] || null }));

    // 5. Apply filters.
    const minWait = Number(minWaitDays) || 0;
    let filtered = rows.filter(r => {
      if (priority !== 'all' && r.triage?.priority !== priority) return false;
      if (sender && !(r.sender_email || '').toLowerCase().includes(sender.toLowerCase())) return false;
      if (minWait > 0) {
        const days = Math.floor((Date.now() - new Date(r.sent_at).getTime()) / (1000 * 60 * 60 * 24));
        if (days < minWait) return false;
      }
      return true;
    });

    // 6. Visibility per mode.
    if (mode === 'queue' || mode === 'focus') {
      filtered = filtered.filter(isInQueue);
      filtered.sort(compareForQueue);
    } else if (mode === 'board') {
      filtered = filtered.filter(isOnBoard);
    }

    const stats = computeStats(rows);
    return res.status(200).json({ emails: filtered, stats });
  } catch (error) {
    console.error('GET /api/triage error:', error);
    return res.status(500).json({ error: 'Failed to load triage' });
  }
}
```

- [ ] **Step 2: Verify the endpoint**

In browser DevTools Network tab while signed in, visit `/api/triage?mode=board` and confirm a 200 response shape `{ emails: [...], stats: {...} }`. An empty `emails` array is expected until Task 4 runs.

- [ ] **Step 3: Commit**

```bash
git add pages/api/triage/index.js
git commit -m "feat(triage): add GET /api/triage to list emails joined with triage records"
```

---

## Task 3: PATCH /api/triage/[id] — update a single triage record

**Files:**
- Create: `pages/api/triage/[id]/index.js`

Accepts partial updates to a triage record (`triageState`, `snoozeUntil`, `priority`, `linkedTaskId`). Creates a default record if none exists yet.

- [ ] **Step 1: Write the handler**

```javascript
// pages/api/triage/[id]/index.js
// PATCH /api/triage/[id] — update a single triage record.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../../lib/auth';
import { DEFAULT_TRIAGE } from '../../../../lib/triage-utils';

const ALLOWED_STATES = ['needs_reply', 'waiting_on', 'fyi_only', 'done', 'dismissed'];
const ALLOWED_PRIORITIES = ['high', 'medium', 'low'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'outlook_id required' });

  const { triageState, snoozeUntil, priority, linkedTaskId } = req.body || {};
  if (triageState && !ALLOWED_STATES.includes(triageState)) {
    return res.status(400).json({ error: 'Invalid triageState' });
  }
  if (priority && !ALLOWED_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Invalid priority' });
  }

  try {
    const key = `email-triage:${userId}`;
    const map = (await kv.get(key)) || {};
    const existing = map[id] || { ...DEFAULT_TRIAGE, outlookId: id };
    const updated = {
      ...existing,
      ...(triageState !== undefined ? { triageState } : {}),
      ...(snoozeUntil !== undefined ? { snoozeUntil } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(linkedTaskId !== undefined ? { linkedTaskId } : {}),
      updatedAt: new Date().toISOString()
    };
    map[id] = updated;
    await kv.set(key, map);
    return res.status(200).json({ triage: updated });
  } catch (error) {
    console.error('PATCH /api/triage/[id] error:', error);
    return res.status(500).json({ error: 'Failed to update triage' });
  }
}
```

- [ ] **Step 2: Verify via browser console (logged-in session)**

```js
fetch('/api/triage/ANY_OUTLOOK_ID', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ triageState: 'dismissed' })
}).then(r => r.json()).then(console.log);
```
Expected: `{ triage: { ..., triageState: 'dismissed', updatedAt: '...' } }`

- [ ] **Step 3: Commit**

```bash
git add pages/api/triage/[id]/index.js
git commit -m "feat(triage): add PATCH endpoint to update triage record state"
```

---

## Task 4: POST /api/triage/analyze — run AI classification

**Files:**
- Create: `pages/api/triage/analyze.js`

Iterates emails, calls Gemini with a classification prompt, writes triage records. `mode: 'all'` reanalyzes everything, `mode: 'unanalyzed'` only touches emails without an `analyzedAt`.

- [ ] **Step 1: Write the handler**

```javascript
// pages/api/triage/analyze.js
// POST /api/triage/analyze — run AI classification on emails.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { bodySnippet, DEFAULT_TRIAGE } from '../../../lib/triage-utils';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const CLASSIFY_PROMPT = `You are analyzing an email on behalf of a busy professional to decide whether it needs a follow-up reply.

Return a strict JSON object with exactly these fields (no commentary, no markdown):
{
  "priority": "high" | "medium" | "low",
  "needsFollowUp": boolean,
  "insight": string,             // 1-2 sentences explaining why this email does or does not need a reply
  "suggestedAction": string,     // short phrase (e.g. "Approve scope or request a call"). Empty string if no action needed.
  "deadlineDetected": string|null // ISO date if a deadline is mentioned, else null
}

Rules:
- "high" = blocking someone OR has a deadline within 3 days OR sender has waited > 3 days.
- "medium" = direct question or request with no hard deadline.
- "low" = FYI, newsletter, automated, or already handled.
- needsFollowUp is TRUE only when the user (recipient) owes a reply or action.
- Keep insight concrete — reference the actual content.`;

async function classifyEmail(model, email) {
  const input = {
    today: new Date().toISOString().slice(0, 10),
    subject: email.subject || '',
    from: `${email.sender_name || ''} <${email.sender_email || ''}>`,
    to: email.to || [],
    cc: email.cc || [],
    sent_at: email.sent_at,
    body: bodySnippet(email.body, 2000)
  };
  const prompt = `${CLASSIFY_PROMPT}\n\nEmail JSON:\n${JSON.stringify(input, null, 2)}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/^```json\s*|\s*```$/g, '');
  const parsed = JSON.parse(text);
  return parsed;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { mode = 'unanalyzed' } = req.body || {};

  try {
    const ids = await kv.zrange('emails:by_date', 0, -1, { rev: true });
    if (!ids || ids.length === 0) return res.status(200).json({ analyzed: 0, skipped: 0, errors: 0 });

    const keys = ids.map(id => `email:${id}`);
    const emails = (await kv.mget(...keys)).filter(Boolean);

    const triageKey = `email-triage:${userId}`;
    const triageMap = (await kv.get(triageKey)) || {};

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let analyzed = 0, skipped = 0, errors = 0;
    for (const email of emails) {
      const existing = triageMap[email.outlook_id];
      if (mode === 'unanalyzed' && existing?.analyzedAt) { skipped += 1; continue; }

      try {
        const c = await classifyEmail(model, email);
        const nextState = existing?.triageState && existing.triageState !== 'fyi_only' && existing.triageState !== 'needs_reply'
          ? existing.triageState // preserve manual moves like waiting_on / done / dismissed
          : (c.needsFollowUp ? 'needs_reply' : 'fyi_only');

        triageMap[email.outlook_id] = {
          ...DEFAULT_TRIAGE,
          ...(existing || {}),
          outlookId: email.outlook_id,
          priority: c.priority,
          needsFollowUp: c.needsFollowUp,
          insight: c.insight,
          suggestedAction: c.suggestedAction,
          deadlineDetected: c.deadlineDetected,
          triageState: nextState,
          analyzedAt: new Date().toISOString()
        };
        analyzed += 1;
      } catch (err) {
        console.error('classify error for', email.outlook_id, err);
        triageMap[email.outlook_id] = {
          ...DEFAULT_TRIAGE,
          ...(existing || {}),
          outlookId: email.outlook_id,
          insight: 'Analysis failed — retry Re-analyze.',
          analyzedAt: new Date().toISOString()
        };
        errors += 1;
      }
    }

    await kv.set(triageKey, triageMap);
    return res.status(200).json({ analyzed, skipped, errors });
  } catch (error) {
    console.error('POST /api/triage/analyze error:', error);
    return res.status(500).json({ error: 'Failed to analyze' });
  }
}
```

- [ ] **Step 2: Verify with a small batch**

In browser console while signed in:
```js
fetch('/api/triage/analyze', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ mode: 'unanalyzed' }) }).then(r => r.json()).then(console.log);
```
Expected: `{ analyzed: N, skipped: 0, errors: 0 }` where N is the number of emails in Redis. Then re-call `GET /api/triage?mode=queue` and confirm some emails now have a `triage` object with `priority`, `insight`, etc.

- [ ] **Step 3: Commit**

```bash
git add pages/api/triage/analyze.js
git commit -m "feat(triage): add POST /api/triage/analyze for AI classification"
```

---

## Task 5: POST /api/triage/[id]/draft-reply — generate AI draft

**Files:**
- Create: `pages/api/triage/[id]/draft-reply.js`

Generates a plain-text draft reply for a single email using Gemini. Returns `{ draft: string }`.

- [ ] **Step 1: Write the handler**

```javascript
// pages/api/triage/[id]/draft-reply.js
// POST /api/triage/[id]/draft-reply — generate an AI draft reply for one email.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { kv } from '@vercel/kv';
import { requireAuth, getUserName } from '../../../../lib/auth';
import { bodySnippet } from '../../../../lib/triage-utils';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'outlook_id required' });

  try {
    const email = await kv.get(`email:${id}`);
    if (!email) return res.status(404).json({ error: 'Email not found' });

    const userName = await getUserName(req, res);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are drafting a reply to the email below on behalf of ${userName}.

Write a professional, concise plain-text reply body only — no subject line, no "To:" header, no markdown, no signature block.
- Address the sender by first name when the name is available.
- Respond directly to questions or requests in the email.
- If information is missing, ask for it specifically.
- Keep it under 150 words.

Original email:
From: ${email.sender_name || ''} <${email.sender_email || ''}>
Subject: ${email.subject || ''}
Sent: ${email.sent_at || ''}

${email.body || ''}

Draft reply:`;

    const result = await model.generateContent(prompt);
    const draft = result.response.text().trim();
    return res.status(200).json({ draft });
  } catch (error) {
    console.error('POST /api/triage/[id]/draft-reply error:', error);
    return res.status(500).json({ error: 'Failed to generate draft' });
  }
}
```

- [ ] **Step 2: Verify in browser console**

```js
fetch('/api/triage/SOME_ID/draft-reply', { method: 'POST' }).then(r => r.json()).then(console.log);
```
Expected: `{ draft: "Hi ..." }` with a plausible reply body. Use an `outlook_id` that was listed in the earlier `GET /api/triage` response.

- [ ] **Step 3: Commit**

```bash
git add pages/api/triage/[id]/draft-reply.js
git commit -m "feat(triage): add draft-reply endpoint for per-email AI generation"
```

---

## Task 6: ViewSwitcher + FilterBar + AnalyzeProgressBar (page chrome)

**Files:**
- Create: `components/triage/ViewSwitcher.js`
- Create: `components/triage/FilterBar.js`
- Create: `components/triage/AnalyzeProgressBar.js`

Dumb presentational components. Parent owns state.

- [ ] **Step 1: Write `ViewSwitcher`**

```javascript
// components/triage/ViewSwitcher.js
import React from 'react';
import { List, Focus, Columns3 } from 'lucide-react';

const MODES = [
  { key: 'queue', label: 'Queue', Icon: List },
  { key: 'focus', label: 'Focus', Icon: Focus },
  { key: 'board', label: 'Board', Icon: Columns3 }
];

export default function ViewSwitcher({ mode, onChange }) {
  return (
    <div className="inline-flex bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-md overflow-hidden text-sm">
      {MODES.map(({ key, label, Icon }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition ${
              active
                ? 'bg-indigo-600 text-white dark:bg-orange-500'
                : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `FilterBar`**

```javascript
// components/triage/FilterBar.js
import React from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

export default function FilterBar({ filters, onChange, onAnalyze, analyzing }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800">
      <select
        value={filters.priority}
        onChange={e => set({ priority: e.target.value })}
        className="text-xs bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded px-2 py-1"
      >
        <option value="all">All priorities</option>
        <option value="high">High only</option>
        <option value="medium">Medium only</option>
        <option value="low">Low only</option>
      </select>
      <input
        value={filters.sender}
        onChange={e => set({ sender: e.target.value })}
        placeholder="Filter by sender"
        className="text-xs bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded px-2 py-1 w-40"
      />
      <select
        value={filters.minWaitDays}
        onChange={e => set({ minWaitDays: Number(e.target.value) })}
        className="text-xs bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded px-2 py-1"
      >
        <option value={0}>Any wait time</option>
        <option value={1}>Waiting 1+ days</option>
        <option value={3}>Waiting 3+ days</option>
        <option value={7}>Waiting 7+ days</option>
      </select>
      <div className="flex-1" />
      <button
        onClick={onAnalyze}
        disabled={analyzing}
        className="text-xs bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-60"
      >
        {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {analyzing ? 'Analyzing…' : 'Re-analyze'}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Write `AnalyzeProgressBar`**

```javascript
// components/triage/AnalyzeProgressBar.js
import React from 'react';

export default function AnalyzeProgressBar({ result, onDismiss }) {
  if (!result) return null;
  const { analyzed, skipped, errors } = result;
  const hasErrors = errors > 0;
  return (
    <div className={`px-4 py-2 text-xs flex items-center justify-between ${
      hasErrors
        ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
        : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    }`}>
      <span>
        Analyzed <strong>{analyzed}</strong>, skipped {skipped}
        {hasErrors ? `, ${errors} errors (see logs)` : ''}
      </span>
      <button onClick={onDismiss} className="underline">dismiss</button>
    </div>
  );
}
```

- [ ] **Step 4: Verify — nothing visible yet, but files compile**

Save and confirm `npm run dev` stays running without syntax errors (check the terminal output).

- [ ] **Step 5: Commit**

```bash
git add components/triage/ViewSwitcher.js components/triage/FilterBar.js components/triage/AnalyzeProgressBar.js
git commit -m "feat(triage): add ViewSwitcher, FilterBar, AnalyzeProgressBar components"
```

---

## Task 7: TriageCard (Queue-mode card)

**Files:**
- Create: `components/triage/TriageCard.js`

Rich card: priority badge, waiting days, subject, sender + recipients, snippet, AI insight, action buttons.

- [ ] **Step 1: Write the component**

```javascript
// components/triage/TriageCard.js
import React from 'react';
import { Sparkles, Paperclip, Clock, CheckCircle2, Archive, X, ListPlus } from 'lucide-react';
import { bodySnippet, waitingDays } from '../../lib/triage-utils';

const PRIORITY_STYLES = {
  high:   { border: 'border-l-red-600',    badge: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  medium: { border: 'border-l-orange-500', badge: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  low:    { border: 'border-l-slate-400',  badge: 'bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300' }
};

export default function TriageCard({ email, onDraftReply, onSnooze, onCreateTask, onDismiss, onMarkDone }) {
  const t = email.triage || {};
  const style = PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.low;
  const days = waitingDays(email);
  const recips = [
    ...(email.to || []).slice(0, 2),
    ...(email.cc || []).slice(0, 1)
  ];
  const extraCount = (email.to?.length || 0) + (email.cc?.length || 0) - recips.length;

  return (
    <div className={`bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 border-l-4 ${style.border} rounded-md p-4 mb-3`}>
      <div className="flex justify-between items-start mb-1 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${style.badge}`}>
            {(t.priority || 'low').toUpperCase()}
            {t.deadlineDetected ? ` · DEADLINE ${new Date(t.deadlineDetected).toLocaleDateString()}` : ''}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-neutral-400 flex items-center gap-1">
            <Clock size={10} /> Waiting {days}d · {new Date(email.sent_at).toLocaleDateString()}
          </span>
        </div>
        {email.has_attachments && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Paperclip size={11} /> {email.attachment_count}
          </span>
        )}
      </div>

      <div className="text-[13px] font-bold text-slate-900 dark:text-white">{email.subject || '(no subject)'}</div>
      <div className="text-[11px] text-slate-600 dark:text-neutral-400 mt-0.5">
        <strong>{email.sender_name || email.sender_email}</strong>{' '}
        <span className="text-slate-400">&lt;{email.sender_email}&gt;</span>
        {recips.length > 0 && <> → {recips.join(', ')}{extraCount > 0 ? `, +${extraCount}` : ''}</>}
      </div>

      <div className="text-[11px] text-slate-700 dark:text-neutral-300 mt-2 leading-relaxed border-l-2 border-slate-200 dark:border-neutral-700 pl-2">
        {bodySnippet(email.body, 220)}
      </div>

      {t.insight && (
        <div className="bg-indigo-50 dark:bg-indigo-950 rounded p-2 mt-3">
          <div className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
            <Sparkles size={10} /> AI INSIGHT
          </div>
          <div className="text-[11px] text-slate-800 dark:text-neutral-200 mt-1 leading-relaxed">{t.insight}</div>
          {t.suggestedAction && (
            <div className="text-[10px] text-indigo-700 dark:text-indigo-300 mt-1">
              <strong>Suggested:</strong> {t.suggestedAction}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        <button onClick={() => onDraftReply(email)} className="text-[11px] bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1 font-semibold flex items-center gap-1">
          <Sparkles size={11} /> Draft Reply
        </button>
        <button onClick={() => onSnooze(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <Clock size={11} /> Snooze
        </button>
        <button onClick={() => onCreateTask(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <ListPlus size={11} /> Create task
        </button>
        <button onClick={() => onMarkDone(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <CheckCircle2 size={11} /> Mark done
        </button>
        <button onClick={() => onDismiss(email)} className="text-[11px] bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1 text-slate-700 dark:text-neutral-200 flex items-center gap-1">
          <X size={11} /> Dismiss
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/triage/TriageCard.js
git commit -m "feat(triage): add TriageCard component for queue-mode rich cards"
```

---

## Task 8: SnoozeMenu + DraftReplyModal

**Files:**
- Create: `components/triage/SnoozeMenu.js`
- Create: `components/triage/DraftReplyModal.js`

- [ ] **Step 1: Write `SnoozeMenu`**

```javascript
// components/triage/SnoozeMenu.js
import React, { useState } from 'react';
import { X } from 'lucide-react';

function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export default function SnoozeMenu({ email, onPick, onClose }) {
  const [custom, setCustom] = useState('');
  const pick = (date) => onPick(email, date.toISOString());
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl w-full md:max-w-sm p-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900 dark:text-white">Snooze until</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={() => pick(addDays(new Date(), 1))} className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded">Tomorrow</button>
          <button onClick={() => pick(addDays(new Date(), 3))} className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded">In 3 days</button>
          <button onClick={() => pick(addDays(new Date(), 7))} className="text-left text-sm px-3 py-2 bg-slate-50 dark:bg-neutral-800 rounded">Next week</button>
          <div className="flex gap-2 mt-1">
            <input type="date" value={custom} onChange={e => setCustom(e.target.value)} className="flex-1 text-sm bg-slate-50 dark:bg-neutral-800 rounded px-2 py-1.5" />
            <button
              disabled={!custom}
              onClick={() => pick(new Date(custom))}
              className="text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1.5 disabled:opacity-50"
            >Pick</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `DraftReplyModal`**

```javascript
// components/triage/DraftReplyModal.js
import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, Copy, Check, RefreshCw } from 'lucide-react';

export default function DraftReplyModal({ email, onClose }) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setDraft('');
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/triage/${email.outlook_id}/draft-reply`, {
        method: 'POST',
        signal: abortRef.current.signal
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
      const { draft: text } = await res.json();
      setDraft(text);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email.outlook_id]);

  const copy = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-xl md:rounded-xl w-full md:max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Draft reply</h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400">To: {email.sender_name || email.sender_email}</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-neutral-400 text-sm">
              <Loader2 size={14} className="animate-spin" /> Generating draft…
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950 rounded p-3">
              {error} <button onClick={generate} className="underline ml-2">Retry</button>
            </div>
          )}
          {!loading && !error && (
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="w-full min-h-[240px] bg-slate-50 dark:bg-neutral-800 rounded p-3 text-sm text-slate-900 dark:text-neutral-100 font-mono"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-neutral-800">
          <button
            onClick={generate}
            disabled={loading}
            className="text-sm bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={13} /> Regenerate
          </button>
          <button
            onClick={copy}
            disabled={!draft || loading}
            className="text-sm bg-indigo-600 dark:bg-orange-500 text-white rounded px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
          >
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy to clipboard</>}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/triage/SnoozeMenu.js components/triage/DraftReplyModal.js
git commit -m "feat(triage): add SnoozeMenu and DraftReplyModal components"
```

---

## Task 9: FocusCard

**Files:**
- Create: `components/triage/FocusCard.js`

Full-screen single-card view with keyboard navigation support (arrow keys handled by parent).

- [ ] **Step 1: Write the component**

```javascript
// components/triage/FocusCard.js
import React from 'react';
import { Sparkles, ChevronLeft, ChevronRight, CheckCircle2, X, Clock, Paperclip } from 'lucide-react';
import { bodySnippet, waitingDays } from '../../lib/triage-utils';

const BADGE = {
  high: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  medium: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  low: 'bg-slate-100 text-slate-700 dark:bg-neutral-800 dark:text-neutral-300'
};

export default function FocusCard({
  email, index, total,
  onPrev, onNext,
  onDraftReply, onSnooze, onDismiss, onMarkDone
}) {
  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 dark:text-neutral-400">
        <CheckCircle2 size={32} className="mb-2 text-emerald-500" />
        <p className="text-sm">No more follow-ups in your queue.</p>
      </div>
    );
  }

  const t = email.triage || {};
  const days = waitingDays(email);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-slate-200 dark:border-neutral-800 p-6">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${BADGE[t.priority] || BADGE.low}`}>
            {(t.priority || 'low').toUpperCase()}
          </span>
          <span className="text-xs text-slate-500 dark:text-neutral-400">{index + 1} / {total}</span>
        </div>

        <h2 className="text-base font-bold text-slate-900 dark:text-white">{email.subject || '(no subject)'}</h2>
        <div className="text-xs text-slate-600 dark:text-neutral-400 mt-1 flex items-center gap-2 flex-wrap">
          <strong>{email.sender_name || email.sender_email}</strong>
          <span>·</span>
          <span className="flex items-center gap-1"><Clock size={11} /> {days}d ago</span>
          {email.has_attachments && <span className="flex items-center gap-1"><Paperclip size={11} /> {email.attachment_count}</span>}
        </div>

        <div className="text-sm text-slate-700 dark:text-neutral-300 mt-3 leading-relaxed border-l-2 border-slate-200 dark:border-neutral-700 pl-3 max-h-48 overflow-auto">
          {bodySnippet(email.body, 1200)}
        </div>

        {t.insight && (
          <div className="bg-indigo-50 dark:bg-indigo-950 rounded p-3 mt-4">
            <div className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-1">
              <Sparkles size={10} /> WHY THIS NEEDS YOU
            </div>
            <div className="text-xs text-slate-800 dark:text-neutral-200 mt-1 leading-relaxed">{t.insight}</div>
            {t.suggestedAction && (
              <div className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-1">
                <strong>Suggested:</strong> {t.suggestedAction}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={() => onDraftReply(email)} className="flex-1 bg-indigo-600 dark:bg-orange-500 text-white rounded-md px-3 py-2 text-sm font-semibold flex items-center justify-center gap-1.5">
            <Sparkles size={13} /> Draft Reply
          </button>
          <button onClick={() => onSnooze(email)} className="flex-1 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-md px-3 py-2 text-sm flex items-center justify-center gap-1.5">
            <Clock size={13} /> Snooze
          </button>
          <button onClick={() => onMarkDone(email)} className="flex-1 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-md px-3 py-2 text-sm flex items-center justify-center gap-1.5">
            <CheckCircle2 size={13} /> Done
          </button>
          <button onClick={() => onDismiss(email)} className="flex-1 bg-slate-100 dark:bg-neutral-800 text-slate-700 dark:text-neutral-200 rounded-md px-3 py-2 text-sm flex items-center justify-center gap-1.5">
            <X size={13} /> Skip
          </button>
        </div>

        <div className="flex justify-between mt-4 text-xs text-slate-500 dark:text-neutral-400">
          <button onClick={onPrev} disabled={index === 0} className="flex items-center gap-1 disabled:opacity-40">
            <ChevronLeft size={14} /> Previous
          </button>
          <button onClick={onNext} disabled={index >= total - 1} className="flex items-center gap-1 disabled:opacity-40">
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/triage/FocusCard.js
git commit -m "feat(triage): add FocusCard for one-at-a-time triage mode"
```

---

## Task 10: BoardCard + BoardColumn

**Files:**
- Create: `components/triage/BoardCard.js`
- Create: `components/triage/BoardColumn.js`

HTML5 drag-and-drop between columns. `BoardCard` is the draggable; `BoardColumn` is the drop zone.

- [ ] **Step 1: Write `BoardCard`**

```javascript
// components/triage/BoardCard.js
import React from 'react';
import { Clock, Paperclip } from 'lucide-react';
import { waitingDays, isSnoozed } from '../../lib/triage-utils';

export default function BoardCard({ email, onClick, onDragStart }) {
  const t = email.triage || {};
  const snoozed = isSnoozed(t);
  const days = waitingDays(email);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', email.outlook_id);
        onDragStart?.(email);
      }}
      onClick={() => onClick?.(email)}
      className={`bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded p-2.5 mb-2 cursor-grab active:cursor-grabbing ${snoozed ? 'opacity-60' : ''}`}
    >
      <div className="text-[11px] font-semibold text-slate-900 dark:text-white line-clamp-2">{email.subject || '(no subject)'}</div>
      <div className="text-[10px] text-slate-500 dark:text-neutral-400 mt-1 flex items-center gap-1.5 flex-wrap">
        <span>{email.sender_name || email.sender_email}</span>
        <span>·</span>
        <span className="flex items-center gap-0.5"><Clock size={9} />{days}d</span>
        {email.has_attachments && <span className="flex items-center gap-0.5"><Paperclip size={9} />{email.attachment_count}</span>}
        {snoozed && <span className="italic">snoozed</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `BoardColumn`**

```javascript
// components/triage/BoardColumn.js
import React, { useState } from 'react';
import BoardCard from './BoardCard';

const TITLES = {
  needs_reply: { label: 'Needs Reply', color: 'text-red-600 dark:text-red-400' },
  waiting_on:  { label: 'Waiting On',  color: 'text-amber-600 dark:text-amber-400' },
  fyi_only:    { label: 'FYI Only',    color: 'text-slate-600 dark:text-neutral-400' },
  done:        { label: 'Done',        color: 'text-emerald-600 dark:text-emerald-400' }
};

export default function BoardColumn({ state, emails, onDrop, onCardClick }) {
  const [dragOver, setDragOver] = useState(false);
  const title = TITLES[state];
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const outlookId = e.dataTransfer.getData('text/plain');
        if (outlookId) onDrop(outlookId, state);
      }}
      className={`flex-1 min-w-0 rounded-md p-2 transition ${dragOver ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'bg-slate-50 dark:bg-neutral-950'}`}
    >
      <div className={`text-[11px] font-bold mb-2 ${title.color}`}>
        {title.label.toUpperCase()} · {emails.length}
      </div>
      {emails.map(e => (
        <BoardCard key={e.outlook_id} email={e} onClick={onCardClick} />
      ))}
      {emails.length === 0 && (
        <div className="text-[11px] text-slate-400 dark:text-neutral-600 italic py-4 text-center">
          Drop here
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add components/triage/BoardCard.js components/triage/BoardColumn.js
git commit -m "feat(triage): add BoardCard and BoardColumn for kanban view"
```

---

## Task 11: Main `pages/triage.js` — scaffolding + Queue view

**Files:**
- Create: `pages/triage.js`

Page with auth guard, theme, sidebar nav, state management, data fetching, and Queue mode rendered by default. Focus and Board modes added in tasks 12 and 13.

- [ ] **Step 1: Write the page**

```javascript
// pages/triage.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import {
  Mail, LogOut, Sun, Moon, Monitor, Menu, CheckCircle2
} from 'lucide-react';
import { APP_VERSION, getAllFeatures } from '../lib/features';
import ViewSwitcher from '../components/triage/ViewSwitcher';
import FilterBar from '../components/triage/FilterBar';
import AnalyzeProgressBar from '../components/triage/AnalyzeProgressBar';
import TriageCard from '../components/triage/TriageCard';
import SnoozeMenu from '../components/triage/SnoozeMenu';
import DraftReplyModal from '../components/triage/DraftReplyModal';
import WhatsNewModal from '../components/ui/WhatsNewModal';

export default function TriagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [emails, setEmails] = useState([]);
  const [stats, setStats] = useState({ total: 0, analyzed: 0, needsReply: 0, waitingOn: 0, fyiOnly: 0, done: 0 });
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('queue');
  const [filters, setFilters] = useState({ priority: 'all', sender: '', minWaitDays: 0 });
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [snoozeTarget, setSnoozeTarget] = useState(null);
  const [draftTarget, setDraftTarget] = useState(null);
  const [theme, setTheme] = useState('system');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Theme
  const applyTheme = useCallback((t) => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && prefersDark));
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'system';
    setTheme(saved);
    applyTheme(saved);
  }, [applyTheme]);

  // Sync mode + filters with URL
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    if (q.mode && q.mode !== mode) setMode(q.mode);
    setFilters({
      priority: q.priority || 'all',
      sender: q.sender || '',
      minWaitDays: Number(q.minWaitDays) || 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const updateUrl = useCallback((next) => {
    const q = {};
    if (next.mode && next.mode !== 'queue') q.mode = next.mode;
    if (next.filters?.priority && next.filters.priority !== 'all') q.priority = next.filters.priority;
    if (next.filters?.sender) q.sender = next.filters.sender;
    if (next.filters?.minWaitDays) q.minWaitDays = next.filters.minWaitDays;
    router.replace({ pathname: '/triage', query: q }, undefined, { shallow: true });
  }, [router]);

  // Fetch data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode,
        priority: filters.priority,
        sender: filters.sender,
        minWaitDays: String(filters.minWaitDays)
      });
      const res = await fetch(`/api/triage?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEmails(data.emails);
      setStats(data.stats);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [mode, filters]);

  useEffect(() => { if (status === 'authenticated') load(); }, [load, status]);

  // Actions
  const patchTriage = async (id, patch) => {
    await fetch(`/api/triage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    load();
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await fetch('/api/triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'unanalyzed' })
      });
      const data = await res.json();
      setAnalyzeResult(data);
      load();
    } catch (err) {
      setAnalyzeResult({ analyzed: 0, skipped: 0, errors: 1 });
    } finally {
      setAnalyzing(false);
    }
  };

  const changeMode = (m) => { setMode(m); updateUrl({ mode: m, filters }); };
  const changeFilters = (f) => { setFilters(f); updateUrl({ mode, filters: f }); };

  const onDraftReply = (email) => setDraftTarget(email);
  const onSnooze = (email) => setSnoozeTarget(email);
  const onPickSnooze = (email, iso) => { setSnoozeTarget(null); patchTriage(email.outlook_id, { snoozeUntil: iso }); };
  const onDismiss = (email) => patchTriage(email.outlook_id, { triageState: 'dismissed' });
  const onMarkDone = (email) => patchTriage(email.outlook_id, { triageState: 'done' });
  const onCreateTask = (email) => {
    // Route to the tasks tool with a prefill hint; a real integration is out of scope for v1.
    window.open(`/?prefillTask=${encodeURIComponent(email.subject || '')}`, '_blank');
  };

  if (status === 'loading') return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setMobileMenuOpen(v => !v)} className="md:hidden"><Menu size={18} /></button>
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-indigo-600 dark:text-orange-500" />
          <h1 className="font-semibold text-slate-900 dark:text-white">Follow-ups</h1>
          <span className="text-xs text-slate-500 dark:text-neutral-400">
            {stats.needsReply} need reply · {stats.waitingOn} waiting · {stats.analyzed}/{stats.total} analyzed
          </span>
        </div>
        <div className="flex-1" />
        <ViewSwitcher mode={mode} onChange={changeMode} />
        <nav className="hidden md:flex items-center gap-3 text-sm text-slate-600 dark:text-neutral-400 ml-4">
          <a href="/" className="hover:text-slate-900 dark:hover:text-white">Tasks</a>
          <a href="/contacts" className="hover:text-slate-900 dark:hover:text-white">Contacts</a>
          <button onClick={() => signOut()} className="hover:text-slate-900 dark:hover:text-white flex items-center gap-1">
            <LogOut size={14} /> Sign out
          </button>
        </nav>
      </header>

      <FilterBar filters={filters} onChange={changeFilters} onAnalyze={handleAnalyze} analyzing={analyzing} />
      <AnalyzeProgressBar result={analyzeResult} onDismiss={() => setAnalyzeResult(null)} />

      <main className="max-w-3xl mx-auto p-4">
        {loading ? (
          <div className="text-sm text-slate-500 dark:text-neutral-400">Loading…</div>
        ) : emails.length === 0 ? (
          <EmptyState stats={stats} onAnalyze={handleAnalyze} analyzing={analyzing} />
        ) : mode === 'queue' ? (
          emails.map(email => (
            <TriageCard
              key={email.outlook_id}
              email={email}
              onDraftReply={onDraftReply}
              onSnooze={onSnooze}
              onDismiss={onDismiss}
              onMarkDone={onMarkDone}
              onCreateTask={onCreateTask}
            />
          ))
        ) : null}
      </main>

      {snoozeTarget && (
        <SnoozeMenu email={snoozeTarget} onPick={onPickSnooze} onClose={() => setSnoozeTarget(null)} />
      )}
      {draftTarget && (
        <DraftReplyModal email={draftTarget} onClose={() => setDraftTarget(null)} />
      )}
    </div>
  );
}

function EmptyState({ stats, onAnalyze, analyzing }) {
  if (stats.total === 0) {
    return (
      <div className="text-center py-16">
        <Mail size={32} className="mx-auto text-slate-300 dark:text-neutral-700" />
        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3">No emails in Redis yet.</p>
        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">Run the Outlook extractor locally to populate.</p>
      </div>
    );
  }
  if (stats.analyzed === 0) {
    return (
      <div className="text-center py-16">
        <Mail size={32} className="mx-auto text-slate-300 dark:text-neutral-700" />
        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3">
          {stats.total} emails ready for analysis.
        </p>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="mt-3 bg-indigo-600 dark:bg-orange-500 text-white rounded px-4 py-2 text-sm disabled:opacity-60"
        >
          {analyzing ? 'Analyzing…' : 'Run AI analysis'}
        </button>
      </div>
    );
  }
  return (
    <div className="text-center py-16">
      <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
      <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3">Nothing needs your follow-up right now.</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

1. Open `http://localhost:3000/triage` while signed in.
2. You should see the header with Queue / Focus / Board toggle, filter bar, and (if no triage records exist) the "Run AI analysis" empty state.
3. Click **Re-analyze** (or the empty-state button). Wait for the green banner.
4. Confirm flagged emails appear as cards with priority badges and AI insight.
5. Click **Snooze** → pick Tomorrow → card disappears from Queue.
6. Click **Dismiss** on another card → disappears from Queue.
7. Click **Draft Reply** → modal opens, draft generates, Copy to Clipboard works.

- [ ] **Step 3: Commit**

```bash
git add pages/triage.js
git commit -m "feat(triage): add /triage page with Queue view and action flows"
```

---

## Task 12: Add Focus view mode to `pages/triage.js`

**Files:**
- Modify: `pages/triage.js`

Add a FocusCard render branch plus keyboard navigation (← → Esc).

- [ ] **Step 1: Add the import at the top of the imports block**

Add after the existing `TriageCard` import:
```javascript
import FocusCard from '../components/triage/FocusCard';
```

- [ ] **Step 2: Add focus index state**

Add near the other `useState` calls (after `snoozeTarget`):
```javascript
const [focusIndex, setFocusIndex] = useState(0);
```

- [ ] **Step 3: Reset focus index when mode or emails change**

Add after the `useEffect` that calls `load`:
```javascript
useEffect(() => { setFocusIndex(0); }, [mode, emails.length]);
```

- [ ] **Step 4: Add keyboard handler**

Add another `useEffect` after the focus-index reset:
```javascript
useEffect(() => {
  if (mode !== 'focus') return;
  const onKey = (e) => {
    if (e.key === 'ArrowRight') setFocusIndex(i => Math.min(i + 1, emails.length - 1));
    if (e.key === 'ArrowLeft') setFocusIndex(i => Math.max(0, i - 1));
    if (e.key === 'Escape') changeMode('queue');
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [mode, emails.length, changeMode]);
```

- [ ] **Step 5: Add the render branch**

Replace the existing ternary `mode === 'queue' ? (...) : null` inside `<main>` with:
```javascript
{mode === 'queue' ? (
  emails.map(email => (
    <TriageCard
      key={email.outlook_id}
      email={email}
      onDraftReply={onDraftReply}
      onSnooze={onSnooze}
      onDismiss={onDismiss}
      onMarkDone={onMarkDone}
      onCreateTask={onCreateTask}
    />
  ))
) : mode === 'focus' ? (
  <FocusCard
    email={emails[focusIndex]}
    index={focusIndex}
    total={emails.length}
    onPrev={() => setFocusIndex(i => Math.max(0, i - 1))}
    onNext={() => setFocusIndex(i => Math.min(i + 1, emails.length - 1))}
    onDraftReply={onDraftReply}
    onSnooze={onSnooze}
    onDismiss={(email) => { onDismiss(email); setFocusIndex(i => Math.min(i, emails.length - 2)); }}
    onMarkDone={(email) => { onMarkDone(email); setFocusIndex(i => Math.min(i, emails.length - 2)); }}
  />
) : null}
```

- [ ] **Step 6: Verify**

1. Switch to Focus via the toggle.
2. Confirm one card is shown centered with 1/N counter.
3. Press → and ← to navigate; press Esc to return to Queue.
4. Dismiss/Mark Done auto-advance to the next card.

- [ ] **Step 7: Commit**

```bash
git add pages/triage.js
git commit -m "feat(triage): add Focus mode with keyboard navigation"
```

---

## Task 13: Add Board view mode to `pages/triage.js`

**Files:**
- Modify: `pages/triage.js`

- [ ] **Step 1: Add imports**

Add after the `FocusCard` import:
```javascript
import BoardColumn from '../components/triage/BoardColumn';
```

- [ ] **Step 2: Group emails by triageState**

Add a `useMemo` after the `useEffect` that resets `focusIndex`:
```javascript
const board = useMemo(() => {
  const cols = { needs_reply: [], waiting_on: [], fyi_only: [], done: [] };
  for (const e of emails) {
    const s = e.triage?.triageState || 'fyi_only';
    if (cols[s]) cols[s].push(e);
  }
  return cols;
}, [emails]);
```

- [ ] **Step 3: Add Board render branch**

Extend the render ternary with a Board branch:
```javascript
) : mode === 'board' ? (
  <div className="max-w-6xl mx-auto flex gap-3">
    {(['needs_reply', 'waiting_on', 'fyi_only', 'done']).map(state => (
      <BoardColumn
        key={state}
        state={state}
        emails={board[state]}
        onDrop={(outlookId, nextState) => patchTriage(outlookId, { triageState: nextState })}
      />
    ))}
  </div>
) : null}
```

Also remove the `max-w-3xl mx-auto` classes from the outer `<main>` in Board mode by changing:
```javascript
<main className="max-w-3xl mx-auto p-4">
```
to:
```javascript
<main className={`p-4 ${mode === 'board' ? '' : 'max-w-3xl mx-auto'}`}>
```

- [ ] **Step 4: Verify**

1. Switch to Board mode.
2. Confirm four columns with counts: Needs Reply / Waiting On / FYI Only / Done.
3. Drag a card from Needs Reply to Waiting On. Refresh — state persists.
4. Confirm dismissed cards do not appear; snoozed cards appear with a faded "snoozed" label.

- [ ] **Step 5: Commit**

```bash
git add pages/triage.js
git commit -m "feat(triage): add Board mode with drag-and-drop between columns"
```

---

## Task 14: Wire sidebar nav on existing pages

**Files:**
- Modify: `pages/index.js`
- Modify: `pages/contacts.js`

Add a "Follow-ups" link to the sidebar/nav in both pages wherever the existing Contacts link appears. Use `Mail` icon.

- [ ] **Step 1: Find the existing Contacts link in `pages/index.js`**

Search for `href="/contacts"`. Each occurrence is the pattern to copy. For each, add a sibling link:
```jsx
<a href="/triage" className="<same classes as the Contacts link>">
  <Mail size={<same size>} /> Follow-ups
</a>
```
Ensure `Mail` is already imported from `lucide-react` in that file (it is, per memory — it's used for other features).

- [ ] **Step 2: Repeat for `pages/contacts.js`**

Same pattern — add a Follow-ups link next to any Contacts / Home nav item.

- [ ] **Step 3: Verify**

1. From `/` click **Follow-ups** → lands on `/triage`.
2. From `/contacts` click **Follow-ups** → lands on `/triage`.
3. Back-nav from `/triage` to `/` and `/contacts` still works (already linked in the triage header).

- [ ] **Step 4: Commit**

```bash
git add pages/index.js pages/contacts.js
git commit -m "feat(triage): add Follow-ups link to main and contacts sidebars"
```

---

## Task 15: What's New entry + version bump

**Files:**
- Modify: `lib/features.js`

Per `CLAUDE.md`, any user-facing feature bumps the version and adds a What's New entry. `Mail` icon is already in the `FEATURE_ICONS` mapping in `components/ui/WhatsNewModal.js`, so no import changes needed there.

- [ ] **Step 1: Bump `APP_VERSION`**

Change line 7 of `lib/features.js`:
```javascript
export const APP_VERSION = 5.5;
```

- [ ] **Step 2: Add the feature entry**

Insert at the top of the `FEATURES` array (directly after `export const FEATURES = [`):
```javascript
  {
    version: 5.5,
    title: 'AI Email Triage',
    description: 'New Follow-ups page uses AI to surface emails that need replies, explains why, and generates draft responses you can copy into Outlook. Works with the Outlook extractor to turn your inbox into a triage queue.',
    icon: 'Mail',
    releaseDate: '2026-04-16'
  },
```

- [ ] **Step 3: Verify**

1. Sign out + sign in (or clear the last-seen version in localStorage via DevTools: `localStorage.removeItem('whatsNewLastSeen')`).
2. Confirm the What's New modal opens with the new AI Email Triage entry and a Mail icon.

- [ ] **Step 4: Commit**

```bash
git add lib/features.js
git commit -m "chore: bump APP_VERSION to 5.5 with AI Email Triage What's New entry"
```

---

## Task 16: Add `.superpowers/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

The brainstorming session created mockup files under `.superpowers/brainstorm/` that should not be committed.

- [ ] **Step 1: Add the entry**

Append to `.gitignore`:
```
# Brainstorming mockups (local only)
.superpowers/
```

- [ ] **Step 2: Verify**

Run: `git status`
Expected: `.superpowers/` no longer appears in untracked files.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers/ brainstorming mockup directory"
```

---

## Task 17: End-to-end smoke test

**Files:** none (manual)

A last walkthrough to catch anything the per-task checks missed.

- [ ] **Step 1: Cold start**

Stop and restart `npm run dev`. Sign in. Navigate to `/triage` from the sidebar.

- [ ] **Step 2: Run the full happy path**

1. Click **Re-analyze** on the FilterBar → banner reports analyzed count with no errors.
2. Queue view: at least one card shown; priority badge, sender, snippet, insight all visible.
3. Apply filter: Priority = high → list shrinks appropriately.
4. Clear sender filter.
5. Switch to Focus: verify 1/N counter, arrow-key navigation, Esc returns to Queue.
6. Switch to Board: drag a card between columns, confirm the count badges update.
7. Refresh the page → Board state persists.
8. On any card click **Draft Reply** → modal opens, draft text generates, **Copy to clipboard** shows ✓ Copied, paste into a text editor to confirm.
9. Click **Snooze** → Tomorrow. Card disappears from Queue. Board view shows it with "snoozed" label in its column.
10. Click **Dismiss** on a low-priority card → disappears from Queue and Board.
11. Open What's New modal from the user menu → AI Email Triage entry visible at the top.

- [ ] **Step 3: Dark mode check**

Toggle theme → dark. Revisit Queue, Focus, and Board. Confirm no unreadable contrast issues. Fix anything obviously broken before shipping.

- [ ] **Step 4: Final commit (only if fixes were needed)**

```bash
git add -A
git commit -m "fix(triage): address smoke-test findings"
```

---

## Self-Review Notes (addressed before handoff)

- **Spec coverage:** All sections implemented — data model (Task 1), GET list (Task 2), PATCH (Task 3), analyze (Task 4), draft-reply (Task 5), all UI components (Tasks 6–10), page with all three modes (Tasks 11–13), nav integration (Task 14), What's New (Task 15), `.gitignore` (Task 16), smoke test (Task 17).
- **Contact auto-linking (mentioned in spec "Open questions"):** Intentionally deferred. Triage works without it; adding a "Linked contact" pill is a ~30-minute follow-up that doesn't belong in the critical path.
- **Tone selection in Draft Reply:** Deferred per spec. Only "professional" is implemented in Task 5's prompt.
- **Mobile:** The page uses existing mobile patterns (bottom-sheet modals, mobile menu toggle). Board mode's 4 columns will need horizontal scroll on narrow screens — acceptable for v1 since the board is a power-user view.
- **No test framework:** Verified — the project ships without jest/vitest. All verification is manual per task. If a test framework is added later, `lib/triage-utils.js` has the most unit-testable pure functions.

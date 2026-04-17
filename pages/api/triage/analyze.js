// pages/api/triage/analyze.js
// POST /api/triage/analyze — run AI classification on emails using Claude.

import Anthropic from '@anthropic-ai/sdk';
import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { bodySnippet, DEFAULT_TRIAGE } from '../../../lib/triage-utils';

const client = new Anthropic();

const CLASSIFY_SYSTEM = `You are analyzing emails on behalf of a busy professional to decide whether each one needs a follow-up reply.

For every email you receive, return a strict JSON object with exactly these fields (no commentary, no markdown, no code fences):
{
  "priority": "high" | "medium" | "low",
  "needsFollowUp": boolean,
  "insight": string,              // 1-2 sentences explaining why this email does or does not need a reply
  "suggestedAction": string,      // short phrase (e.g. "Approve scope or request a call"). Empty string if no action needed.
  "deadlineDetected": string|null // ISO 8601 date (YYYY-MM-DD) if a deadline is mentioned, else null
}

Rules:
- "high" = blocking someone OR has a deadline within 3 days OR sender has waited > 3 days.
- "medium" = direct question or request with no hard deadline.
- "low" = FYI, newsletter, automated, or already handled.
- needsFollowUp is TRUE only when the user (recipient) owes a reply or action.
- Keep insight concrete — reference the actual content.`;

function extractJson(raw) {
  const cleaned = raw.trim().replace(/^```json\s*|^```\s*|\s*```$/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(cleaned.slice(first, last + 1));
  }
  throw new Error(`Could not parse JSON. Raw: ${cleaned.slice(0, 300)}`);
}

async function classifyEmail(email) {
  const input = {
    today: new Date().toISOString().slice(0, 10),
    subject: email.subject || '',
    from: `${email.sender_name || ''} <${email.sender_email || ''}>`,
    to: email.to || [],
    cc: email.cc || [],
    sent_at: email.sent_at,
    body: bodySnippet(email.body, 2000)
  };

  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: [
      { type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } }
    ],
    messages: [
      { role: 'user', content: `Classify this email:\n${JSON.stringify(input, null, 2)}` }
    ]
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text block in Claude response');
  return extractJson(textBlock.text);
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

    let analyzed = 0, skipped = 0, errors = 0;
    const errorSamples = [];

    for (const email of emails) {
      if (!email.outlook_id) continue;
      const existing = triageMap[email.outlook_id];
      const previouslySucceeded = existing?.analyzedAt && existing?.insight && !existing.insight.startsWith('Analysis failed');
      if (mode === 'unanalyzed' && previouslySucceeded) { skipped += 1; continue; }

      try {
        const c = await classifyEmail(email);
        const nextState = existing?.triageState && existing.triageState !== 'fyi_only' && existing.triageState !== 'needs_reply'
          ? existing.triageState
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
        const msg = err?.message || String(err);
        console.error('classify error for', email.outlook_id, msg);
        if (errorSamples.length < 3) errorSamples.push(msg);
        triageMap[email.outlook_id] = {
          ...DEFAULT_TRIAGE,
          ...(existing || {}),
          outlookId: email.outlook_id,
          insight: 'Analysis failed — retry Re-analyze.',
          analyzedAt: null
        };
        errors += 1;
      }
    }

    await kv.set(triageKey, triageMap);
    return res.status(200).json({ analyzed, skipped, errors, errorSamples });
  } catch (error) {
    console.error('POST /api/triage/analyze error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to analyze' });
  }
}

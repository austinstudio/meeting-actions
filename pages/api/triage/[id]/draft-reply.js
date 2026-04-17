// pages/api/triage/[id]/draft-reply.js
// POST /api/triage/[id]/draft-reply — generate an AI draft reply using Claude.

import Anthropic from '@anthropic-ai/sdk';
import { kv } from '@vercel/kv';
import { requireAuth, getUserName } from '../../../../lib/auth';
import { bodySnippet } from '../../../../lib/triage-utils';

const client = new Anthropic();

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

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 1024,
      system: `You draft professional, concise email replies on behalf of ${userName}.

Write only the plain-text reply body — no subject line, no "To:" header, no markdown, no signature block.
- Address the sender by first name when the name is available.
- Respond directly to questions or requests in the email.
- If information is missing, ask for it specifically.
- Keep it under 150 words.`,
      messages: [
        {
          role: 'user',
          content: `Draft a reply to this email:

From: ${email.sender_name || ''} <${email.sender_email || ''}>
Subject: ${email.subject || ''}
Sent: ${email.sent_at || ''}

${bodySnippet(email.body, 3000)}`
        }
      ]
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const draft = textBlock ? textBlock.text.trim() : '';
    return res.status(200).json({ draft });
  } catch (error) {
    console.error('POST /api/triage/[id]/draft-reply error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Failed to generate draft' });
  }
}

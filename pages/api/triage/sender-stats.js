// pages/api/triage/sender-stats.js
// GET top senders and domains by email volume, plus sample subjects.

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';
import { normalizeSender, domainOf, shouldIgnore } from '../../../lib/triage-ignore';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    const ids = await kv.zrange('emails:by_date', 0, -1, { rev: true });
    if (!ids?.length) return res.status(200).json({ senders: [], domains: [] });

    const emails = (await kv.mget(...ids.map(id => `email:${id}`))).filter(Boolean);
    const ignoreList = (await kv.get(`email-ignore:${userId}`)) || [];

    const senders = new Map(); // addr -> { count, samples: [subj], ignored }
    const domains = new Map(); // dom  -> { count, samples: [subj], ignored }

    for (const email of emails) {
      const addr = normalizeSender(email.sender_email);
      if (!addr) continue;
      const dom = domainOf(addr);
      const ignored = shouldIgnore(addr, ignoreList);

      const s = senders.get(addr) || { addr, name: email.sender_name || '', domain: dom, count: 0, samples: [], ignored };
      s.count += 1;
      if (s.samples.length < 3 && email.subject) s.samples.push(email.subject);
      senders.set(addr, s);

      if (dom) {
        const d = domains.get(dom) || { domain: dom, count: 0, samples: [], ignored: ignoreList.some(e => e.type === 'domain' && normalizeSender(e.pattern) === dom) };
        d.count += 1;
        if (d.samples.length < 3 && email.subject) d.samples.push(email.subject);
        domains.set(dom, d);
      }
    }

    const topSenders = [...senders.values()].sort((a, b) => b.count - a.count).slice(0, 30);
    const topDomains = [...domains.values()].sort((a, b) => b.count - a.count).slice(0, 20);

    return res.status(200).json({ senders: topSenders, domains: topDomains });
  } catch (error) {
    console.error('GET /api/triage/sender-stats error:', error);
    return res.status(500).json({ error: 'Failed to load stats' });
  }
}

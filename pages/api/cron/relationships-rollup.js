// GET /api/cron/relationships-rollup — daily (vercel.json). Recomputes every roster person's rollup, clears
// expired holds and trims the review tray. Bounded: ≤ 100 people, ≤ 400 KV commands, 20 s. Auth: the Vercel
// cron bearer (CRON_SECRET). Single-user deployment: the roster owner is INBOUND_EMAIL_USER_ID.
import { kv } from '@vercel/kv';
import { rollupAll, countingKV, RelationshipsError } from '../../../lib/relationships-store.mjs';

export const COMMAND_BUDGET = 400;
export const TIME_BUDGET_MS = 20_000;

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  const userId = (process.env.INBOUND_EMAIL_USER_ID || '').trim();
  if (!userId) return res.status(500).json({ error: 'User ID not configured' });
  const { kv: budgeted, counter } = countingKV(kv, COMMAND_BUDGET);
  try {
    const result = await rollupAll(budgeted, userId, { deadlineMs: TIME_BUDGET_MS });
    return res.status(200).json({ ...result, commands: counter.commands });
  } catch (error) {
    if (error instanceof RelationshipsError && error.code === 'budget_exhausted') {
      console.error('relationships-rollup: KV budget exhausted');
      return res.status(200).json({ partial: true, commands: counter.commands, error: error.code });
    }
    console.error('relationships-rollup error:', error);
    return res.status(500).json({ error: 'Rollup failed' });
  }
}

// Shared plumbing for pages/api/relationships/*: error mapping and the contacts/tasks reads every route needs.
import { RelationshipsError } from './relationships-store.mjs';

/** Run a route body; RelationshipsError → its status/code, anything else → 500. */
export async function withErrors(res, fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RelationshipsError) return res.status(error.status).json({ error: error.message, code: error.code });
    console.error('relationships route error:', error);
    return res.status(500).json({ error: 'Relationships request failed', code: 'internal' });
  }
}

export const param = value => (Array.isArray(value) ? value[0] : value);

export async function readArrays(kv, names) {
  const values = await Promise.all(names.map(n => kv.get(n).then(v => (Array.isArray(v) ? v : []))));
  return Object.fromEntries(names.map((n, i) => [n, values[i]]));
}

// Generic compare-and-set for one JSON value in KV.
//
// The same Lua as lib/task-store.mjs (`TASKS_CAS_SCRIPT`), reused for any key that must never be
// read-modify-written by two writers at once: the Relationships roster and each per-person key.
// Protocol: read `<versionKey>` (default 0), read the value, compute the new value in JavaScript,
// then commit through a script that writes only if the version is unchanged and increments it.
// On conflict the mutation is re-run against fresh data. task-store and capture-idempotency keep
// their own copies of the script on purpose; this module is the shared form for new keys.
import { TASKS_CAS_SCRIPT } from './task-store.mjs';
import { KV_MAX_REQUEST_BYTES, SAFETY_MARGIN_BYTES } from './kv-limits.mjs';

export const CAS_SCRIPT = TASKS_CAS_SCRIPT;

export class CASError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CASError';
    this.code = code;
  }
}

/**
 * Run `mutate(current)` against the stored JSON value (or `initial` when the key is empty) and
 * commit the result atomically. `mutate` may be async and returns `{ value, ...anything }` to write,
 * or `null` to write nothing; the same object is returned so callers can build a response from it.
 * Retries on conflict with backoff; throws CASError ('write_conflict' | 'too_large').
 */
export async function updateJSON(kv, key, versionKey, mutate, { attempts = 6, initial = null } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const version = (await kv.get(versionKey)) ?? 0;
    const stored = await kv.get(key);
    const current = stored === null || stored === undefined ? (typeof initial === 'function' ? initial() : initial) : stored;
    const outcome = await mutate(current);
    if (outcome === null || outcome === undefined) return null;
    if (!('value' in outcome)) throw new CASError('bad_mutation', 'updateJSON: mutate must return { value }.');
    const json = JSON.stringify(outcome.value);
    if (Buffer.byteLength(json, 'utf8') > KV_MAX_REQUEST_BYTES - SAFETY_MARGIN_BYTES) {
      throw new CASError('too_large', `Refusing to write '${key}': ${Buffer.byteLength(json, 'utf8')} bytes is at the KV 10 MB request limit.`);
    }
    const stored1 = await kv.eval(CAS_SCRIPT, [key, versionKey], [json, String(version)]);
    if (Number(stored1) === 1) return outcome;
    await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
  }
  throw new CASError('write_conflict', `'${key}' changed repeatedly while updating. Try again.`);
}

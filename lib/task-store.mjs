// Atomic updates for the shared `tasks` array.
//
// Every task-writing route used to read the whole array, edit it in JavaScript and write it
// back. A capture committed between that read and write (captures append atomically in Lua)
// was silently erased, and because its idempotency receipt survived, retrying the capture
// replayed "success" without restoring the tasks. Writers now go through `updateTasks`:
// read a version counter, read the array, compute the new array, then commit with a Lua
// compare-and-set that only writes if the version is unchanged. On conflict the mutation is
// re-run against fresh data. The capture commit script increments the same counter.
import { KV_MAX_REQUEST_BYTES, SAFETY_MARGIN_BYTES } from './kv-limits.mjs';

export const TASKS_KEY = 'tasks';
export const TASKS_VERSION_KEY = 'tasks:version';

export const TASKS_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[2])
if not current then current = '0' end
if current ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('INCR', KEYS[2])
return 1
`;

export class TaskStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'TaskStoreError';
    this.code = code;
  }
}

/**
 * Run `mutate(tasks)` against the current array and commit the result atomically.
 * `mutate` may be async. It returns `{ tasks, ...anything }` to write, or `null` to write
 * nothing (for example, the task was not found). The same object is returned to the caller
 * so handlers can build their response from it. Retries on conflict; throws `TaskStoreError`
 * ('tasks_write_conflict') when writers keep colliding, or ('tasks_too_large').
 */
export async function updateTasks(kv, mutate, { attempts = 6 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Version first, then the array: a write landing between the two reads makes the CAS fail
    // (stale version), never succeed with stale tasks.
    const version = (await kv.get(TASKS_VERSION_KEY)) ?? 0;
    const current = (await kv.get(TASKS_KEY)) || [];
    if (!Array.isArray(current)) throw new TaskStoreError('tasks_corrupt', 'The tasks store is not an array.');
    const outcome = await mutate(current);
    if (outcome === null || outcome === undefined) return null;
    if (!Array.isArray(outcome.tasks)) throw new TaskStoreError('bad_mutation', 'updateTasks: mutate must return { tasks }.');
    const json = JSON.stringify(outcome.tasks);
    if (Buffer.byteLength(json, 'utf8') > KV_MAX_REQUEST_BYTES - SAFETY_MARGIN_BYTES) {
      throw new TaskStoreError('tasks_too_large', `Refusing to write 'tasks': ${Buffer.byteLength(json, 'utf8')} bytes is at the KV 10 MB request limit.`);
    }
    const stored = await kv.eval(TASKS_CAS_SCRIPT, [TASKS_KEY, TASKS_VERSION_KEY], [json, String(version)]);
    if (Number(stored) === 1) return outcome;
    await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
  }
  throw new TaskStoreError('tasks_write_conflict', 'The tasks store changed repeatedly while updating. Try again.');
}

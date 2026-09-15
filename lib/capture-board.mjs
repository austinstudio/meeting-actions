// Shared pieces of the Quick Notes read routes (GET /api/capture/inbox and /api/capture/board):
// one task serializer, the meetingTitle join, the orderings, and limit parsing. The field
// names in `serializeTask` are a contract with the phone app; add fields, never rename them.

function timeOrLast(value) {
  const time = typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

/** `limit` query parameter: positive integer, else `fallback`, never above `max`. */
export function parseLimit(value, { fallback, max }) {
  const n = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

/** meetingId -> title for meetings the user may see (legacy meetings without userId included). */
export function meetingTitleIndex(meetings, userId) {
  const titles = new Map();
  for (const m of Array.isArray(meetings) ? meetings : []) {
    if (m && m.id && (!m.userId || m.userId === userId)) titles.set(m.id, m.title ?? null);
  }
  return titles;
}

/** The user's live tasks: not deleted, not archived. */
export function liveTasks(tasks, userId) {
  return (Array.isArray(tasks) ? tasks : []).filter(t => t && t.userId === userId && !t.deleted && !t.archived);
}

/** Oldest createdAt first; missing or unparseable createdAt last. Array.prototype.sort is stable. */
export function byCreatedAt(a, b) {
  return timeOrLast(a.createdAt) - timeOrLast(b.createdAt);
}

/** dueDate ascending (undated last), then createdAt ascending (missing last). */
export function byDueThenCreated(a, b) {
  return (timeOrLast(a.dueDate) - timeOrLast(b.dueDate)) || byCreatedAt(a, b);
}

export function serializeTask(t, titles) {
  return {
    id: t.id,
    task: t.task ?? '',
    status: t.status ?? null,
    archived: Boolean(t.archived),
    deleted: Boolean(t.deleted),
    owner: t.owner ?? null,
    dueDate: t.dueDate ?? null,
    priority: t.priority ?? null,
    type: t.type ?? null,
    person: t.person ?? null,
    meetingId: t.meetingId ?? null,
    meetingTitle: t.meetingId ? (titles.get(t.meetingId) ?? null) : null,
    createdAt: t.createdAt ?? null,
    tags: Array.isArray(t.tags) ? t.tags : [],
    // One sentence from extraction on why the task exists; Triage shows it under the meeting title.
    context: typeof t.context === 'string' && t.context.trim() ? t.context.trim().slice(0, 500) : null,
  };
}

/** YYYY-MM-DD for `now` in `tz` (invalid or missing zone → UTC), matching lib/triage-stats.mjs. */
export function todayKey(tz, now = new Date()) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  let format;
  try { format = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', ...options }); }
  catch { format = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...options }); }
  return format.format(now);
}

/** Open board task: live, not in the inbox (missing status counts as inbox) and not done. */
export function isOpenBoardTask(t) {
  const status = t.status ?? 'uncategorized';
  return status !== 'uncategorized' && status !== 'done';
}

/**
 * The tasks the phone's board lists: the open board tasks only. The inbox has its own route and the
 * phone's Board never renders the Done column (done tasks stay on the website until "Archive Completed"),
 * so neither takes a slot in the `limit` slice. Order is preserved.
 */
export function boardTasks(live) {
  return live.filter(isOpenBoardTask);
}

/** Open board tasks whose YYYY-MM-DD due date is before today in `tz`. Undated or malformed dates never count. */
export function overdueCount(live, { now = new Date(), tz = 'UTC' } = {}) {
  const today = todayKey(tz, now);
  return live.filter(t => isOpenBoardTask(t) && typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) && t.dueDate < today).length;
}

/** Live tasks in the Follow up column (`waiting`). Same number as columnCounts.waiting, named for the phone. */
export function followUpCount(live) {
  return live.filter(t => t.status === 'waiting').length;
}

/** status id → number of live tasks in that column (missing status counts as uncategorized). */
export function columnCounts(live) {
  const counts = {};
  for (const t of live) {
    const status = t.status ?? 'uncategorized';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

/**
 * People with the most open board tasks: every task not done and not in the inbox counts once per distinct
 * name in its owner and person fields (case-insensitive merge, first spelling kept). Blanks and "unassigned"
 * are skipped; the phone removes its own owner's names. Sorted by count desc, then name.
 */
export function assigneeCounts(live, { limit = 12 } = {}) {
  const counts = new Map();
  for (const t of live) {
    if (t.status === 'done' || t.status === 'uncategorized' || t.status == null) continue;
    const seen = new Set();
    for (const raw of [t.owner, t.person]) {
      const name = typeof raw === 'string' ? raw.trim() : '';
      const key = name.toLowerCase();
      if (!name || key === 'unassigned' || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { name, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, limit);
}

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

// Triage statistics for the Quick Notes inbox burn-down dial.
//
// A "clear" is the moment a task leaves the inbox: a status activity entry whose oldValue is
// 'uncategorized' and whose newValue is anything else (see createActivityEntry in
// pages/api/tasks/[id].js). Clears are counted on every task the user owns, including ones
// later deleted or archived, because the triage work still happened. Events are bucketed by
// the local calendar day in `tz`; days without a clear are omitted (clients treat them as 0).

const DAY_MS = 24 * 60 * 60 * 1000;

function dayFormatter(tz) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', ...options });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', ...options });
  }
}

export function isInboxClear(entry) {
  return Boolean(entry)
    && entry.type === 'update'
    && entry.field === 'status'
    && entry.oldValue === 'uncategorized'
    && entry.newValue !== 'uncategorized';
}

function eventTime(timestamp) {
  if (typeof timestamp !== 'string' && typeof timestamp !== 'number') return NaN;
  return new Date(timestamp).getTime();
}

/**
 * @param {Array<object>} tasks   the full tasks array from KV
 * @param {string} userId         only this user's tasks are counted
 * @param {{ now?: Date, tz?: string, days?: number }} [options]
 * @returns {{ clearedByDay: Record<string, number>, cleared30Days: number }}
 *   clearedByDay keys are YYYY-MM-DD in `tz`; cleared30Days is the total inside the window
 *   (now - days, now], regardless of the `days` value actually passed.
 */
export function computeTriageStats(tasks, userId, { now = new Date(), tz = 'UTC', days = 30 } = {}) {
  const end = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const start = end - days * DAY_MS;
  const format = dayFormatter(tz);
  const clearedByDay = {};
  let total = 0;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task || task.userId !== userId || !Array.isArray(task.activity)) continue;
    for (const entry of task.activity) {
      if (!isInboxClear(entry)) continue;
      const time = eventTime(entry.timestamp);
      if (!Number.isFinite(time) || time <= start || time > end) continue;
      const day = format.format(time);
      clearedByDay[day] = (clearedByDay[day] || 0) + 1;
      total++;
    }
  }
  return { clearedByDay, cleared30Days: total };
}

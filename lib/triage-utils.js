// lib/triage-utils.js
// Shared helpers for the email triage feature.

export const DEFAULT_TRIAGE = {
  priority: 'low',
  needsFollowUp: false,
  insight: '',
  suggestedAction: '',
  deadlineDetected: null,
  triageState: 'fyi_only',
  snoozeUntil: null,
  linkedTaskId: null,
  analyzedAt: null
};

// Priority weight for sorting (higher = more urgent)
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

// True if snoozeUntil is set and still in the future.
export function isSnoozed(triage) {
  if (!triage?.snoozeUntil) return false;
  return new Date(triage.snoozeUntil) > new Date();
}

// Waiting days since the email was sent.
export function waitingDays(email) {
  if (!email?.sent_at) return 0;
  const sent = new Date(email.sent_at);
  const now = new Date();
  return Math.max(0, Math.floor((now - sent) / (1000 * 60 * 60 * 24)));
}

// Sort comparator: priority desc, then waiting days desc, then sent_at desc.
export function compareForQueue(a, b) {
  const aP = PRIORITY_WEIGHT[a.triage?.priority] || 0;
  const bP = PRIORITY_WEIGHT[b.triage?.priority] || 0;
  if (aP !== bP) return bP - aP;
  const aW = waitingDays(a);
  const bW = waitingDays(b);
  if (aW !== bW) return bW - aW;
  const aT = a.sent_at ? new Date(a.sent_at).getTime() : 0;
  const bT = b.sent_at ? new Date(b.sent_at).getTime() : 0;
  return bT - aT;
}

// Visibility predicates for view modes.
export function isInQueue(row) {
  const t = row.triage;
  if (!t) return false;
  if (t.triageState !== 'needs_reply') return false;
  if (isSnoozed(t)) return false;
  return true;
}

export function isOnBoard(row) {
  const t = row.triage;
  if (!t) return false;
  return t.triageState !== 'dismissed';
}

// Classify how the user was addressed on an email.
// Returns { role, label, toList, ccList, othersInTo, othersInCc }.
export function recipientRole(email, userEmail) {
  const me = (userEmail || '').toLowerCase().trim();
  const toList = (email?.to || []).map(a => String(a).toLowerCase().trim()).filter(Boolean);
  const ccList = (email?.cc || []).map(a => String(a).toLowerCase().trim()).filter(Boolean);
  const inTo = !!me && toList.includes(me);
  const inCc = !!me && ccList.includes(me);
  const othersInTo = toList.filter(a => a !== me);
  const othersInCc = ccList.filter(a => a !== me);

  let role, label;
  if (inTo && toList.length === 1) {
    role = 'direct';
    label = 'To: you';
  } else if (inTo) {
    role = 'direct-plus';
    label = `To: you + ${othersInTo.length}`;
  } else if (inCc) {
    role = 'cc';
    label = toList.length > 0 ? `CC'd (To: ${toList.length})` : "CC'd";
  } else if (toList.length > 0) {
    role = 'indirect';
    const first = toList[0];
    label = toList.length === 1 ? `To: ${first}` : `To: ${first} + ${toList.length - 1}`;
  } else {
    role = 'unknown';
    label = '';
  }
  return { role, label, toList, ccList, othersInTo, othersInCc };
}

// Short body snippet for card preview (~200 chars, collapse whitespace).
export function bodySnippet(body, maxLen = 200) {
  if (!body) return '';
  const clean = body.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + '…';
}

// Compute stats for the header.
export function computeStats(rows) {
  const stats = { total: rows.length, analyzed: 0, needsReply: 0, waitingOn: 0, fyiOnly: 0, done: 0 };
  for (const r of rows) {
    const t = r.triage;
    if (!t) continue;
    stats.analyzed += 1;
    if (t.triageState === 'needs_reply' && !isSnoozed(t)) stats.needsReply += 1;
    else if (t.triageState === 'waiting_on') stats.waitingOn += 1;
    else if (t.triageState === 'fyi_only') stats.fyiOnly += 1;
    else if (t.triageState === 'done') stats.done += 1;
  }
  return stats;
}

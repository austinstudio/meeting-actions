// lib/applaud-ingest.mjs
// Pure helpers for pages/api/applaud-webhook.js (no KV, no Gemini) so the meeting shape and the
// duplicate rules can be unit-tested. Applaud posts `transcript_ready` once per recording; the same
// recording can arrive twice (poller + replay endpoint, or a Mac-app-cache import that is later
// upgraded to its Plaud-cloud id), so duplicates are matched on the recording id AND the start time,
// which survives the local→cloud id change.
//
// PRD-15 (Oct 2026): Applaud may send `participants` (Teams display names, "Last, First") and
// `meeting_source` ("teams" | null); the payload's list wins over Gemini's guessed one. A later
// `transcript_updated` event replaces the transcript and participants of the existing meeting
// without re-extracting tasks (applaudTranscriptUpdate). Contract: docs/applaud-webhook-contract.md.

export const MAX_PARTICIPANTS = 100;
export const MAX_PARTICIPANT_CHARS = 120;

/** YYYY-MM-DD for the recording's start (UTC), falling back to today. */
export function applaudMeetingDate(startTimeMs, now = new Date()) {
  const d = Number.isFinite(startTimeMs) && startTimeMs > 0 ? new Date(startTimeMs) : now;
  return d.toISOString().split('T')[0];
}

/** Duration label the web app renders verbatim ("42 min"). Gemini's guess wins when it gives one. */
export function applaudDurationLabel(extractedDuration, durationMs) {
  if (extractedDuration) return extractedDuration;
  if (!Number.isFinite(durationMs) || durationMs < 60_000) return null;
  return `${Math.round(durationMs / 60_000)} min`;
}

/** Existing meeting for the same Plaud recording, or null. */
export function findApplaudDuplicate(meetings, { plaudRecordingId, startTimeMs }) {
  const hasStart = Number.isFinite(startTimeMs) && startTimeMs > 0;
  return (meetings || []).find(m =>
    (plaudRecordingId && m.plaudRecordingId === plaudRecordingId) ||
    (hasStart && m.plaudStartTimeMs === startTimeMs)) || null;
}

/**
 * Participants named by the payload: trimmed, de-duplicated (case-insensitive), capped at
 * MAX_PARTICIPANTS entries of MAX_PARTICIPANT_CHARS each. Returns null when the payload names
 * nobody usable, so callers can fall back to Gemini's list / the stored one.
 */
export function applaudParticipants(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim().slice(0, MAX_PARTICIPANT_CHARS).trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_PARTICIPANTS) break;
  }
  return out.length ? out : null;
}

/** `meeting_source` as stored: a short string ("teams") or null. */
export function applaudMeetingSource(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 40) : null;
}

/**
 * Meeting record for addMeetingWithTasks (transcript is stripped into its own key there).
 * `participants` (from the payload) overrides Gemini's guessed list when present.
 */
export function applaudMeetingRecord({ userId, title, extracted, transcriptText, meetingDate, plaudRecordingId, startTimeMs, durationMs, participants = null, meetingSource = null, now = new Date() }) {
  const createdAt = now.toISOString();
  const meta = extracted?.meeting || {};
  const guessed = Array.isArray(meta.participants) ? meta.participants.filter(p => typeof p === 'string') : [];
  return {
    id: `m_${now.getTime()}`,
    userId,
    title: (typeof meta.title === 'string' && meta.title.trim()) ? meta.title.trim() : title,
    sourceFileName: title,
    transcript: transcriptText,
    date: meetingDate,
    duration: applaudDurationLabel(meta.duration, durationMs),
    participants: applaudParticipants(participants) || guessed,
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    plaudRecordingId: plaudRecordingId || null,
    plaudStartTimeMs: Number.isFinite(startTimeMs) && startTimeMs > 0 ? startTimeMs : null,
    source: 'applaud',
    meetingSource: applaudMeetingSource(meetingSource),
    processedAt: createdAt,
  };
}

/**
 * Stored meeting metadata after a `transcript_updated` event. Never touches title, summary, date,
 * duration or tasks. An empty transcript leaves the stored one alone (only participants/source move);
 * a payload without participants leaves the stored list alone.
 */
export function applaudTranscriptUpdate(meeting, { transcriptText, participants = null, meetingSource, now = new Date() }) {
  const text = typeof transcriptText === 'string' ? transcriptText.trim() : '';
  const next = { ...meeting, transcriptUpdatedAt: now.toISOString() };
  if (text) {
    next.hasTranscript = true;
    next.transcriptLength = text.length;
  }
  const named = applaudParticipants(participants);
  if (named) next.participants = named;
  if (meetingSource !== undefined) next.meetingSource = applaudMeetingSource(meetingSource);
  return next;
}

// ---------------------------------------------------------------------------
// Re-attribution after a late Teams transcript (Nov 2026).
//
// transcript_ready usually fires before the owner opens the meeting's Teams Recap, so Gemini's first
// pass assigns owners from "Speaker B"-style labels. When transcript_updated later brings real names,
// the existing tasks are re-attributed in place: same ids, same text, only owner / person change,
// and only for tasks the owner has not touched. No new tasks are ever created here.
// ---------------------------------------------------------------------------

const GENERIC_SPEAKER = /^(speaker(\s+[a-z0-9]{1,3})?|speaker_\d+|unknown)$/i;
const SPEAKER_LINE = /^\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\]\s*)?([^:\n]{1,80}?):\s/;

/** Distinct speaker labels that are real names (not "Speaker", "Speaker B", "SPEAKER_03", "Unknown"). */
export function namedSpeakers(transcriptText) {
  const names = new Set();
  if (typeof transcriptText !== 'string') return names;
  for (const line of transcriptText.split('\n')) {
    const m = SPEAKER_LINE.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    if (!label || GENERIC_SPEAKER.test(label)) continue;
    names.add(label);
  }
  return names;
}

/** True when the new transcript names speakers the stored one did not. */
export function hasNamedSpeakerGain(previousText, nextText) {
  const next = namedSpeakers(nextText);
  if (next.size === 0) return false;
  const prev = namedSpeakers(previousText);
  for (const n of next) if (!prev.has(n)) return true;
  return false;
}

/** The owner edited this task's attribution by hand (website PATCH logs an 'update' on owner / person). */
export function attributionEditedByUser(task) {
  return Array.isArray(task?.activity)
    && task.activity.some(a => a && a.type === 'update' && (a.field === 'owner' || a.field === 'person') && a.user !== REATTRIBUTION_USER);
}

export const REATTRIBUTION_USER = 'Applaud (Teams names)';

/** Tasks of this meeting that are safe to re-attribute: not archived, not done, not hand-edited. */
export function reattributionCandidates(tasks, meetingId) {
  return (tasks || []).filter(t =>
    t && t.meetingId === meetingId && !t.archived && t.status !== 'done' && !attributionEditedByUser(t));
}

/** "Last, First" → "First Last"; other strings unchanged. */
function displayName(name) {
  const m = /^([^,]+),\s*(.+)$/.exec(name);
  return m ? `${m[2].trim()} ${m[1].trim()}` : name;
}

/** Names the model may assign: payload participants (both forms), named speakers, plus Me / Unassigned. */
export function allowedAttributionNames(participants, transcriptText) {
  const allowed = new Map(); // lower-case → canonical display form
  const add = n => { if (typeof n === 'string' && n.trim()) allowed.set(n.trim().toLowerCase(), n.trim()); };
  add('Me'); add('Unassigned');
  for (const n of namedSpeakers(transcriptText)) add(n);
  for (const p of applaudParticipants(participants) || []) { add(displayName(p)); add(p); }
  return allowed;
}

/**
 * Apply the model's { id, owner, person } assignments to `tasks`. Only candidate tasks change, only to
 * allowed names, only when the value actually differs; each change gets an 'update' activity entry so
 * the website history shows it. Returns { tasks, changed } — `tasks` is a new array when anything changed.
 */
export function applyReattribution(tasks, { meetingId, assignments, allowed, now = new Date() }) {
  const candidates = new Set(reattributionCandidates(tasks, meetingId).map(t => t.id));
  const byId = new Map();
  for (const a of Array.isArray(assignments) ? assignments : []) {
    if (a && typeof a.id === 'string' && candidates.has(a.id)) byId.set(a.id, a);
  }
  if (byId.size === 0) return { tasks, changed: 0 };

  const stamp = now.toISOString();
  const canonical = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    return allowed.get(value.trim().toLowerCase()) ?? null;
  };
  let changed = 0;
  const next = tasks.map(task => {
    const a = byId.get(task?.id);
    if (!a) return task;
    const updates = [];
    const owner = canonical(a.owner);
    if (owner && owner !== task.owner) updates.push(['owner', task.owner, owner]);
    if (task.type === 'follow-up' && a.person !== undefined) {
      const person = a.person === null ? null : canonical(a.person);
      if (person !== null && person !== 'Me' && person !== 'Unassigned' && person !== task.person) updates.push(['person', task.person ?? null, person]);
    }
    if (updates.length === 0) return task;
    changed++;
    const copy = { ...task, activity: Array.isArray(task.activity) ? [...task.activity] : [] };
    for (const [field, from, to] of updates) {
      copy[field] = to;
      copy.activity.push({ id: `act_${now.getTime()}_${field}_${copy.activity.length}`, type: 'update', field, oldValue: from, newValue: to, user: REATTRIBUTION_USER, timestamp: stamp });
    }
    if (copy.activity.length > 50) copy.activity = copy.activity.slice(-50);
    copy.updatedAt = stamp;
    return copy;
  });
  return { tasks: changed ? next : tasks, changed };
}

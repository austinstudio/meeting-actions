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

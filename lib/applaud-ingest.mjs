// lib/applaud-ingest.mjs
// Pure helpers for pages/api/applaud-webhook.js (no KV, no Gemini) so the meeting shape and the
// duplicate rules can be unit-tested. Applaud posts `transcript_ready` once per recording; the same
// recording can arrive twice (poller + replay endpoint, or a Mac-app-cache import that is later
// upgraded to its Plaud-cloud id), so duplicates are matched on the recording id AND the start time,
// which survives the local→cloud id change.

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

/** Meeting record for addMeetingWithTasks (transcript is stripped into its own key there). */
export function applaudMeetingRecord({ userId, title, extracted, transcriptText, meetingDate, plaudRecordingId, startTimeMs, durationMs, now = new Date() }) {
  const createdAt = now.toISOString();
  const meta = extracted?.meeting || {};
  return {
    id: `m_${now.getTime()}`,
    userId,
    title: (typeof meta.title === 'string' && meta.title.trim()) ? meta.title.trim() : title,
    sourceFileName: title,
    transcript: transcriptText,
    date: meetingDate,
    duration: applaudDurationLabel(meta.duration, durationMs),
    participants: Array.isArray(meta.participants) ? meta.participants.filter(p => typeof p === 'string') : [],
    summary: typeof meta.summary === 'string' ? meta.summary : '',
    plaudRecordingId: plaudRecordingId || null,
    plaudStartTimeMs: Number.isFinite(startTimeMs) && startTimeMs > 0 ? startTimeMs : null,
    source: 'applaud',
    processedAt: createdAt,
  };
}

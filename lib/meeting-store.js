// lib/meeting-store.js
// Meeting persistence helpers.
//
// Why this exists: `meetings` used to be one JSON array in KV that included every
// transcript. It hit Upstash's 10 MB per-request limit (10,485,760 bytes) in
// August 2026 and every ingest (email, Applaud, Plaud, quick-capture) failed
// with "ERR max request size exceeded" until the array shrank. Transcripts were
// 97% of the blob and are only read on demand (TranscriptModal), so they now
// live in their own keys:
//
//   meetings                       -> [ meeting metadata, no transcript, hasTranscript: true ]
//   meeting:<id>:transcript        -> { text }
//
// Use these helpers everywhere a meeting is created, read or deleted so the
// two stay in sync.

import { kv } from '@vercel/kv';

export const MEETINGS_KEY = 'meetings';
export const TASKS_KEY = 'tasks';
export const transcriptKey = (id) => `meeting:${id}:transcript`;

// Upstash rejects any single request over this. Keep a margin so we fail loudly
// with a useful message before Redis does.
export const KV_MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const SAFETY_MARGIN_BYTES = 256 * 1024;

export async function getMeetings() {
  try { return (await kv.get(MEETINGS_KEY)) || []; }
  catch (e) { console.error('KV get meetings error:', e); return []; }
}

export async function getTasks() {
  try { return (await kv.get(TASKS_KEY)) || []; }
  catch (e) { console.error('KV get tasks error:', e); return []; }
}

export async function saveMeetings(meetings) {
  assertFits(MEETINGS_KEY, meetings);
  await kv.set(MEETINGS_KEY, meetings);
}

export async function saveTasks(tasks) {
  assertFits(TASKS_KEY, tasks);
  await kv.set(TASKS_KEY, tasks);
}

/** Split a meeting into blob-safe metadata and its transcript text. */
export function stripTranscript(meeting) {
  if (!meeting || typeof meeting.transcript !== 'string') {
    return { meta: meeting, transcript: null };
  }
  const { transcript, ...meta } = meeting;
  return {
    meta: { ...meta, hasTranscript: transcript.length > 0, transcriptLength: transcript.length },
    transcript,
  };
}

export async function saveTranscript(meetingId, text) {
  if (!text) return;
  await kv.set(transcriptKey(meetingId), { text });
}

export async function getTranscript(meetingId) {
  const stored = await kv.get(transcriptKey(meetingId));
  if (!stored) return null;
  // Tolerate a bare string in case something wrote one directly.
  return typeof stored === 'string' ? stored : stored.text ?? null;
}

export async function deleteTranscript(meetingId) {
  await kv.del(transcriptKey(meetingId));
}

/**
 * Persist a new meeting and its tasks. Transcript is written first (small,
 * independent key), then the metadata arrays are read-modify-written.
 * Returns the metadata record that was stored.
 */
export async function addMeetingWithTasks(meeting, newTasks = []) {
  const { meta, transcript } = stripTranscript(meeting);
  await saveTranscript(meeting.id, transcript);

  const meetings = await getMeetings();
  const tasks = await getTasks();
  meetings.unshift(meta);
  const mergedTasks = [...newTasks, ...tasks];

  await saveMeetings(meetings);
  await saveTasks(mergedTasks);
  return meta;
}

/** Remove a meeting record and its transcript key. Caller handles tasks. */
export async function removeMeeting(meetings, meetingId) {
  const remaining = meetings.filter(m => m.id !== meetingId);
  await saveMeetings(remaining);
  await deleteTranscript(meetingId);
  return remaining;
}

function assertFits(key, value) {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (bytes > KV_MAX_REQUEST_BYTES - SAFETY_MARGIN_BYTES) {
    throw new Error(
      `Refusing to write '${key}': ${bytes} bytes is at the KV 10 MB request limit. ` +
      `Run scripts/migrate-transcripts.mjs or archive old records.`
    );
  }
}

// ---------------------------------------------------------------------------
// Cross-source duplicate detection.
// Plaud AutoFlow emails ("[Plaud-AutoFlow] MM-DD <title>") and Applaud webhooks
// (filename "MM-DD <title>") deliver the same recording, often a day apart.
// Both ingest routes call findMatchingMeeting() before spending Gemini calls.

/** Lower-case, drop "Email:"/"Applaud:" labels, the AutoFlow tag and a leading "MM-DD ", collapse punctuation. */
export function normalizeTitle(s) {
  return String(s || '').toLowerCase()
    .replace(/^\s*(email|applaud):\s*/, '')
    .replace(/\[plaud-autoflow\]\s*/, '')
    .replace(/^\s*\d{2}-\d{2}\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * @param {object[]} meetings   full meetings array
 * @param {object}   q          { title, date: 'YYYY-MM-DD', sources?: string[], days?: number }
 * @returns the matching meeting or null
 */
export function findMatchingMeeting(meetings, { title, date, sources, days = 3 }) {
  const wanted = normalizeTitle(title);
  if (wanted.length < 8) return null;
  const when = Date.parse(date || '');
  const dayMs = 24 * 60 * 60 * 1000;
  return meetings.find(m => {
    if (sources && !sources.includes(m.source)) return false;
    if (!Number.isNaN(when) && Math.abs(Date.parse(m.date || '') - when) > days * dayMs) return false;
    const a = normalizeTitle(m.sourceFileName);
    const b = normalizeTitle(m.title);
    return a === wanted || b === wanted || (a.length >= 8 && a.includes(wanted)) || (wanted.includes(a) && a.length >= 20);
  }) || null;
}

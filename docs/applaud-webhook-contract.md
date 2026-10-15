# Applaud → tasks server webhook contract

Route: `POST /api/applaud-webhook` (`pages/api/applaud-webhook.js`). Sender: the owner's local Applaud app. PRD-15 (Teams transcripts) added `participants`, `meeting_source` and the `transcript_updated` event; pure helpers live in `lib/applaud-ingest.mjs`, tests in `tests/applaud-webhook.test.mjs`.

## Auth

Every event carries `X-Applaud-Signature: sha256=<hex HMAC-SHA256 of the raw JSON body>` keyed with `APPLAUD_WEBHOOK_SECRET`. A bad or missing signature is `401 { error: "Invalid signature" }`. (If the server has no secret configured the check is skipped.) `X-Applaud-Event` may mirror `event`; the body is authoritative.

## Payload (both events)

```jsonc
{
  "event": "transcript_ready" | "transcript_updated",
  "recording": { "id": "rec-42", "filename": "10-14 Q4 Planning", "start_time_ms": 0, "end_time_ms": 0, "duration_ms": 0 },
  "content": { "transcript_text": "...", "summary_markdown": "..." },
  "participants": ["Chhabria, Nikesh Kumar", "Okafor, Dan"],   // optional; Teams display names, "Last, First"
  "meeting_source": "teams" | null,                            // optional
  "enrichment": { "dropFile": "...", "offsetSeconds": 3.2, "clusters": { "SPEAKER_03": { "name": "...", "purity": 0.91, "votes": 40 } }, "at": "ISO" }  // optional, ignored by the server
}
```

| Field | Server use |
| --- | --- |
| `recording.id` | Stored as `plaudRecordingId`; the identity for duplicates and for `transcript_updated`. |
| `recording.filename`, `start_time_ms`, `duration_ms` | Title fallback, meeting date (UTC), duration label, `plaudStartTimeMs`. |
| `content.transcript_text` | Stored in `meeting:<id>:transcript`; `transcriptLength` / `hasTranscript` on the meeting. Must be ≥ 120 chars on `transcript_ready`. |
| `participants` | Strings only; trimmed, de-duplicated case-insensitively, at most 100 entries of 120 chars. When at least one survives it is stored as the meeting's `participants` and Gemini's guessed list is discarded; otherwise Gemini's list (`transcript_ready`) or the stored list (`transcript_updated`) is kept. Stored as sent — "Last, First" is not rewritten; Relationships matches either form against roster contacts. |
| `meeting_source` | Stored as `meetingSource` (string, max 40 chars) or `null`. |
| `enrichment`, `summary_markdown` | Accepted and ignored. |

## `transcript_ready`

Creates the meeting and its tasks (Gemini extraction via `lib/extract.js`). Participants from the payload take precedence as above. Relationships' meeting-signal hook (`recordMeetingSignals`, called inside `addMeetingWithTasks`) gives each roster participant a high-confidence `meeting` touch with `sourceRef: meeting:<id>`.

Responses:

- `200 { ok: true, meeting: { id, title }, taskCount }` — created.
- `200 { ok: true, skipped: true, reason, ... }` — other events, empty/short transcript, before `APPLAUD_ACCEPT_AFTER`, or a duplicate (same recording id / start time, or already imported via the Plaud e-mail). Duplicate responses include `meeting: { id, title }`.
- `502 { error: "Extraction failed" }` — Gemini failed; Applaud should retry.
- `500 { error: "Server not configured" }` — `INBOUND_EMAIL_USER_ID` unset.

## `transcript_updated`

Sent when a Teams drop file arrives after `transcript_ready` already went out. Same signature. The server finds the meeting with `plaudRecordingId === recording.id` for the configured user, then under the meetings compare-and-set:

- replaces the stored transcript and recomputes `transcriptLength` / `hasTranscript` (an empty `transcript_text` leaves the stored transcript alone);
- replaces `participants` (when the payload names any) and sets `meetingSource`;
- stamps `transcriptUpdatedAt`.

It never re-runs extraction, never creates or edits tasks, and never changes title, summary, date or duration. Afterwards `recordMeetingSignals` runs best-effort so newly named roster people get a meeting touch; `sourceRef: meeting:<id>` makes repeats no-ops, so resending the event is idempotent.

Responses:

- `200 { updated: true, meeting: { id, title } }`
- `404 { error: "unknown_recording" }` — no meeting with that recording id (Applaud should send `transcript_ready` instead, or retry later).
- `400 { error: "missing_recording_id" }`
- `401` / `500` as above.

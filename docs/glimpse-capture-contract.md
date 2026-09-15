# Glimpse → tasks: capture contract

How an external capture source (first: Glimpse, the macOS screen assistant) posts items into the tasks app so
they appear in the web board and in Heading's Inbox / Triage with no phone changes. Written 2026-09-15 from the
Glimpse session's proposal (`/tmp/glimpse-integration.md`) and the server code as of this commit. Server-side
pieces referenced here are implemented; the Glimpse-side pieces are the Glimpse repo's to build.

## Endpoint

`POST https://tasks.usdc.design/api/capture/structured`

Headers:

```
Authorization: Bearer <glimpse token>        # its own entry in MOBILE_API_TOKENS (Vercel env), never committed
Content-Type: application/json
Idempotency-Key: <captureID>                 # optional; must equal body.captureID when present
```

The route is on the middleware allowlist for bearer clients. The server does **no model work** when the body
says `clientParse` + `serverParse: false`; the tasks are stored exactly as sent. Do not send raw OCR text —
only the insight the client has already extracted.

## Body

```json
{
  "captureID": "<UUID derived from 'glimpse:' + insight.sourceKey>",
  "source": "glimpse",
  "transcript": "<insight.title>\n\n<insight.body>",
  "recordedAt": 1789750000000,
  "localDate": "2026-09-15",
  "timeZone": "America/New_York",
  "serverParse": false,
  "clientParse": {
    "engine": "glimpse-claude",
    "title": "<insight.source, e.g. Microsoft Teams — chat with Nancy Bailey>",
    "summary": "",
    "tasks": [
      {
        "task": "<insight.title, ≤ 300 chars>",
        "context": "<insight.body, ≤ 500 chars>",
        "owner": "Me",
        "type": "action",
        "priority": "high | medium | low",
        "person": "<optional: who it involves>",
        "dueDate": "<optional YYYY-MM-DD>"
      }
    ]
  }
}
```

Field notes:

| Field | Rule |
|---|---|
| `captureID` | UUID string, lower-case. Derive deterministically from the insight's stable `sourceKey` so a retry or a re-triage of the same item never creates a second task. |
| `source` | Literal `glimpse`. Drives the tag, the meeting title and the filing (see below). |
| `transcript` | Required, non-empty. It is what the idempotency fingerprint hashes: a re-post with the same `captureID` and **different** transcript text returns `409 capture_id_conflict`. Updates therefore go through `PATCH /api/tasks/<id>`, never a second capture. |
| `localDate` / `timeZone` | The Mac's local calendar day and IANA zone; the day meeting and the transcript-log clock time use them. |
| `clientParse.tasks[].priority` | Glimpse `high → high`, `normal → medium`, `fyi → low`. Default policy: send `high` automatically, everything else only when the user clicks "Send to tasks". |
| `clientParse.tasks[].person`, `dueDate` | Optional. The phone shows owner/due chips, the Inbox "Who's on your plate" bars count `person`, and overdue counts use `dueDate`. |

The `ParsedTask` / `ClientParse` / `StructuredCaptureRequest` Swift types in
`quick-notes-apple-watch/Packages/QuickNotesCore` (macOS 15+) encode exactly this body; Glimpse can depend on
that package so the wire format cannot drift.

## What the server does with it

- **Tags** the tasks `["glimpse"]` (`lib/capture-sources.mjs`). The Triage card renders tags as chips, so the
  source is visible on the phone and the web board can filter on it. App captures stay `watch`, Pebble `pebble`.
- **Files** the item in a per-source day meeting: id `m_capture_day_<userhash16>_<YYYY-MM-DD>_glimpse`, title
  `Glimpse — Sep 15, 2026`, `sourceFileName: "Glimpse"`. Voice memos keep their own `Quick captures — <date>`
  meeting; the two never mix. Each capture's transcript is appended to the day's transcript log as
  `[h:mm AM] <transcript>`.
- **Idempotency:** the receipt (`capture-receipt:v1:<userhash>:<captureID>`, 90-day TTL) returns the original
  response on retry. After 90 days a re-post would create a new task, so Glimpse must persist the returned
  task id and never re-post an insight that already has one.
- **Response:** `{ success, parsedBy, meeting: { id, title, summary, date }, tasks: [ { id, task, status, … } ], message }`.
  Persist `tasks[0].id` as the insight's `server_task_id`.

## Reading status back

`GET /api/capture/inbox?ids=<id1>,<id2>,…` — up to 20 ids per call, any status, in the order asked; ids that
are trashed or archived are simply absent. Poll only ids with a `server_task_id` and only on the engine tick
(every 10 min), in batches of 20, same as the phone's `TaskStatusRefresher`.

Mapping back into Glimpse:

| Server status | Glimpse |
|---|---|
| `uncategorized` | still in the Inbox; chip "Inbox" |
| `todo`, `in-progress` | chip "To do" |
| `waiting` | chip "Follow up" |
| `done` | insight → done, `statusChangedBy: "remote"` |
| absent from the response | trashed/archived on the board → insight → expired |

## Writing status from Glimpse

Only **user** actions sync outward:

- User clicks Done → `PATCH /api/tasks/<id>` `{ "status": "done" }`.
- Snooze → **no server call** (local attention management; the board's Follow-up column has its own meaning).
- Title/body refined by a later triage → `PATCH /api/tasks/<id>` `{ "task": …, "context": … }`, never a re-post.

Model-inferred done/expired stays local.

## Client-side guards (Glimpse)

Every tick against this server is metered work on someone else's quota. Per tick: cap posts (e.g. 20), stop on
the first `401`/`403` (bad token) and on the first `5xx`, and back off for the rest of the tick. Never loop on a
`409`: it means the item changed text; PATCH instead.

## Later (not built)

- **Lock-screen triage for Glimpse items:** `lib/apns.mjs notifyDevices` can push a `glimpse-task` reason with
  the `TASK_TRIAGE` category so To do / Done / Follow up / Delete work from the phone's notification.
- **Website filter** on the `glimpse` tag and a "Glimpse" section on the meetings page.

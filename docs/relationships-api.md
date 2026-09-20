# Relationships API (PRD-14) — contract

Server routes for the People tab (Heading) and `/relationships` (website). Written 2026-09-19; the phone, the
website and the server build against this text. Wire types live in `QuickNotesCore/RelationshipsAPI.swift`.
Auth: session cookie or `Authorization: Bearer` (middleware allowlist `/api/relationships`). All bodies JSON.
Dates are ISO-8601 strings; `day` values are `YYYY-MM-DD`.

## Objects

```jsonc
RosterEntry  { "contactId": "c_…", "list": "crew" | "guests", "rank": 1, "cadenceDays": 7,
               "holdUntil": "2026-10-03T00:00:00Z" | null, "addedAt": "…" }

Touch        { "id": "t_…", "at": "…", "channel": "meeting"|"call"|"chat"|"mail"|"work"|"note",
               "direction": "in"|"out"|"both", "about": "Q3 roadmap review",
               "source": "manual"|"meeting"|"task"|"glimpse"|"applaud"|"mail", "sourceRef": "m_…"|"task_…"|null,
               "confidence": "high"|"medium", "inferred": false }

Squawk       { "id": "s_…", "text": "Renewal pricing range", "type": "raise"|"feedback"|"ask",
               "createdAt": "…", "raisedAt": "…" | null, "source": "manual"|"voice" }

Rollup       { "lastTouchAt": "…" | null, "lastTouchChannel": "meeting" | null, "lastTouchAbout": "…" | null,
               "touches30d": 3, "touches90d": 7, "openThreads": 4, "owed": 2, "waitingOn": 1, "openSquawks": 2 }

Person       { "entry": RosterEntry, "contact": { "id", "name", "role", "company", "relationshipContext" },
               "rollup": Rollup }                                   // list payload; no touches/squawks bodies

ReviewItem   { "id": "r_…", "contactId": "c_…", "signal": "chat"|"mail"|"meeting", "at": "…",
               "text": "Glimpse saw a Teams chat with Ayan Pal", "excerpt": "can you send the nav spec…",
               "source": "glimpse"|"mail"|"applaud", "sourceRef": "…" }

Thread       { "taskId": "task_…", "title": "Send revised SOW", "status": "todo", "dueDate": "2026-09-30"|null,
               "relation": "theirs"|"mine"|"waitingOnThem", "gate": "S16" }
```

Bands and queue order are **computed by the client** from `rollup.lastTouchAt`, `entry.cadenceDays`,
`entry.holdUntil`, `entry.addedAt`, `entry.rank`, list size and `rollup.openSquawks` (PRD-14 §6). The server
never sends a band word. Reference formula, so both clients agree:

```
daysSince = days(today − (lastTouchAt ?? addedAt))
ratio     = daysSince / cadenceDays
band      = holdUntil > today ? HOLD : lastTouchAt == null ? NO_CONTACT_LOGGED
          : ratio < 0.75 ? ON_FREQ : ratio < 1 ? APPROACHING : ratio < 2 ? NO_RADIO : LOST_CONTACT
pillBand  = openSquawks > 0 && band in {ON_FREQ, APPROACHING} ? one band later : band
rankWeight  = 1 + (listSize − rank) / listSize
squawkBoost = openSquawks > 0 ? 1.25 : 1
score = max(0, ratio − 1) × rankWeight × squawkBoost          // HOLD and NO_CONTACT_LOGGED score 0
queue = people with score > 0, descending score
```

## Routes

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/relationships` | — | `{ people: [Person], reviewCount: n, updatedAt }` (both lists, rank order) |
| `PUT /api/relationships/roster` | `{ crew: [contactId…], guests: [contactId…] }` | `{ people }` — full order; ranks rewritten 1…n per list; CAS |
| `POST /api/relationships/roster` | `{ contactId, list, cadenceDays? }` | `201 { person }`; appended at the end of the list; default cadence 7 (crew) / 14 (guests); `409` if already on a list |
| `DELETE /api/relationships/roster/<contactId>` | — | `{ ok }` — contact untouched; person key kept 30 days (`rel:…:person:<id>:removedAt`) |
| `PATCH /api/relationships/<contactId>` | `{ cadenceDays?, holdUntil?: string\|null, list?, mutedSources?: [string] }` | `{ person }` |
| `POST /api/relationships/<contactId>/touches` | `{ at?, channel, about?, direction? }` (defaults now / `out`) | `201 { touch, rollup }` |
| `DELETE /api/relationships/<contactId>/touches/<touchId>` | — | `{ rollup }` (undo) |
| `GET /api/relationships/<contactId>/touches?limit=50` | — | `{ touches }` newest first |
| `POST /api/relationships/<contactId>/squawks` | `{ text, type? }` (default `raise`) | `201 { squawk }` |
| `PATCH /api/relationships/<contactId>/squawks/<id>` | `{ raisedAt?: string\|null, text? }` | `{ squawk }` |
| `DELETE /api/relationships/<contactId>/squawks/<id>` | — | `{ ok }` |
| `POST /api/relationships/<contactId>/pins` | `{ taskId }` | `{ pinnedTaskIds }` |
| `DELETE /api/relationships/<contactId>/pins/<taskId>` | — | `{ pinnedTaskIds }` |
| `GET /api/relationships/<contactId>/rundown` | — | `{ person, squawks, threads: [Thread], mentions: [{source, text, at, ref}], touches: [Touch] (≤ 10) }` |
| `GET /api/relationships/review` | — | `{ items: [ReviewItem] }` oldest first, ≤ 50 |
| `POST /api/relationships/review/<id>` | `{ accept: bool, aliasOf?: contactId }` | `{ touch? , rollup? }` — accept writes a touch (medium, `inferred: false`); reject records the rejection; 3 rejections of one `source` for a person add it to `mutedSources` |
| `GET /api/cron/relationships-rollup` | header `Authorization: Bearer $CRON_SECRET` | `{ people: n, commands: n, ms }` — recompute rollups, expire holds, prune review to 50; hard caps |

Errors: `400 { error, code }` for bad bodies; `404` for unknown contact / not on roster; `409 { code: "already_on_roster" }`.

## Threads (how `openThreads`, `owed`, `waitingOn` are derived)

From the `tasks` array (live tasks only): **theirs** = `owner` resolves to the contact (name or alias); **mine** =
`owner` is Me and `person` resolves to the contact (this is `owed`); **waitingOnThem** = `type == "follow-up"` or
`status == "waiting"` with `person` resolving to the contact; plus any `pinnedTaskIds`. `gate` = last four of the
task id, uppercased (same as Triage's Nº).

## Signals (`recordSignal`, server-internal)

`recordSignal({ userId, name|contactId, at, channel, about, source, sourceRef, confidence })` resolves the name
through the contacts directory (exact name → alias → unique 3-letter first name), drops people not on the roster,
de-duplicates on `sourceRef`, then: `high` → touch; `medium` → ReviewItem (or touch when the person has ≥ 10
accepted items from that source). Callers in phase 0: `addMeetingWithTasks` / `commitCapture` (meeting
participants and title mentions, high), `PATCH /api/tasks/[id]` status → done (work, medium, `inferred: true`,
written directly as a half-weight touch, never to review).

## Storage

```
rel:<userHash>:roster            { crew: [RosterEntry], guests: [RosterEntry], updatedAt }   CAS via rel:<userHash>:roster:version
rel:<userHash>:person:<contactId> { touches ≤ 200 newest first, squawks, pinnedTaskIds, mutedSources,
                                    accepted: {source: n}, rejected: {source: n}, rollup }   CAS via …:version
rel:<userHash>:review             zset, score = at (ms), member = ReviewItem JSON, ZREMRANGEBYRANK to 50
```

No `SCAN`; every cron loop bounded by roster size (≤ 100) and a 400-command / 20 s budget.

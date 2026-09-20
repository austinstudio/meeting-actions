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
               "lastTouchInferred": false, "lastFirmTouchAt": "…" | null,   // firm = not inferred; clients use it for NO RADIO
               "touches30d": 3, "touches90d": 7, "openThreads": 4, "owed": 2, "waitingOn": 1, "openSquawks": 2,
               "computedAt": "…" }

Person       { "entry": RosterEntry, "contact": { "id", "name", "role", "company", "relationshipContext" },
               "rollup": Rollup }                                   // list payload; no touches/squawks bodies

ReviewItem   { "id": "r_…", "contactId": "c_…", "signal": "chat"|"mail"|"meeting", "at": "…",
               "text": "Glimpse saw a Teams chat with Ayan Pal", "excerpt": "can you send the nav spec…",
               "source": "glimpse"|"mail"|"applaud", "sourceRef": "…" }

Thread       { "taskId": "task_…", "title": "Send revised SOW", "status": "todo", "dueDate": "2026-09-30"|null,
               "relation": "theirs"|"mine"|"waitingOnThem", "gate": "S16", "pinned": false }
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
inferred  : when lastTouchInferred, a client may compute NO RADIO / LOST CONTACT from lastFirmTouchAt instead
            (an inferred work touch resets APPROACHING only, PRD-14 §7)
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
| `POST /api/relationships/roster` | `{ contactId, list, cadenceDays? }` | `201 { person, backfill }`; appended at the end of the list; default cadence 7 (crew) / 14 (guests); `409` if already on a list. The add runs the backfill (below) inline and returns its summary (or `{ error: "backfill_failed" }`; the add itself never fails because of it) |
| `DELETE /api/relationships/roster/<contactId>` | — | `{ ok }` — contact untouched; the person key gets `removedAt` (cleared if they are re-added; a 30-day purge is not built yet) |
| `PATCH /api/relationships/<contactId>` | `{ cadenceDays?, holdUntil?: string\|null, list?, mutedSources?: [string] }` | `{ person, mutedSources }` — editing cadence/hold keeps the rank position; `list` moves the person to the end of the other list |
| `POST /api/relationships/<contactId>/touches` | `{ at?, channel, about?, direction? }` (defaults now / `out`) | `201 { touch, rollup }` |
| `DELETE /api/relationships/<contactId>/touches/<touchId>` | — | `{ rollup }` (undo) |
| `GET /api/relationships/<contactId>/touches?limit=50` | — | `{ touches }` newest first |
| `POST /api/relationships/<contactId>/squawks` | `{ text, type? }` (default `raise`) | `201 { squawk }` |
| `PATCH /api/relationships/<contactId>/squawks/<id>` | `{ raisedAt?: string\|null, text? }` | `{ squawk }` |
| `DELETE /api/relationships/<contactId>/squawks/<id>` | — | `{ ok }` |
| `POST /api/relationships/<contactId>/pins` | `{ taskId }` | `{ pinnedTaskIds }` |
| `DELETE /api/relationships/<contactId>/pins/<taskId>` | — | `{ pinnedTaskIds }` |
| `POST /api/relationships/<contactId>/backfill` | — | "Rescan": `{ touchesAdded, bySource: { meeting, mail, transcript, task }, commands, ms, partial }` — see §Backfill. `404` when not on the roster |
| `GET /api/relationships/<contactId>/rundown` | — | `{ person, squawks, threads: [Thread], mentions: [{source, text, at, ref}] (≤ 20), touches: [Touch] (≤ 10), pinnedTaskIds, mutedSources }` |
| `GET /api/relationships/review` | — | `{ items: [ReviewItem] }` oldest first, ≤ 50 |
| `POST /api/relationships/review/<id>` | `{ accept: bool, aliasOf?: contactId }` | accept → `{ accepted: true, touch, rollup }` (medium, `inferred: false`, written to `aliasOf` when given); reject → `{ accepted: false, mutedSources }`; 3 rejections of one `source` for a person add it to `mutedSources` |
| `GET /api/cron/relationships-rollup` | header `Authorization: Bearer $CRON_SECRET` | `{ people, holdsExpired, ms, commands }` — recompute rollups, expire holds, prune review to 50; ≤ 100 people, ≤ 400 KV commands (past the budget → `200 { partial: true }`), 20 s. Single-user: the roster owner is `INBOUND_EMAIL_USER_ID`. Scheduled 09:30 UTC in `vercel.json` |

Errors: `400 { error, code }` for bad bodies; `404` for unknown contact / not on roster; `409 { code: "already_on_roster" }`.

## Threads (how `openThreads`, `owed`, `waitingOn` are derived)

From the `tasks` array — live (not deleted, not archived) **and not done**: **waitingOnThem** = `type == "follow-up"`
or `status == "waiting"` with `person` naming the contact (checked first); **theirs** = `owner` names the contact;
**mine** = `owner` is Me (or empty) and `person` names the contact (this is `owed`); plus any `pinnedTaskIds`
(relation `mine` when no rule applies, `pinned: true`). "Names" = full name, alias, or a bare first name of three or
more letters, case-insensitive. Sorted by due date, undated last. `gate` = last four of the task id, uppercased.

## Signals (`recordSignal`, server-internal)

`recordSignal({ userId, name|contactId, at, channel, about, excerpt, source, sourceRef, confidence, inferred })` resolves
the name through the contacts directory (id → exact name → alias → unique 3-letter first name), drops people not on
the roster, de-duplicates on `sourceRef` (a `seen` list of 500 per person, shared by touches and review items),
skips muted sources, then: `high` or `inferred` or ≥ 10 accepted from that source → touch; otherwise → ReviewItem.
Returns `{ outcome: touch|review|skipped, reason? }` and never throws for bad names or channels. Callers in phase 0: `addMeetingWithTasks` / `commitCapture` (meeting
participants and title mentions, high), `PATCH /api/tasks/[id]` status → done (work, medium, `inferred: true`,
written directly as a half-weight touch, never to review).

## Backfill (`backfillPerson`, run on add and by `POST …/backfill`)

Historical touches from what is already in KV, gathered first and written in **one** person update so the
`seen` de-dupe applies (a rescan never doubles a touch; a later live signal for the same meeting or task is a
no-op because the sourceRefs match the feeds': `meeting:<id>`, `task-done:<id>`, `email:<id>`).

| Source | Rule | Touch |
|---|---|---|
| Meetings (≤ 730 days) | contact in `participants[]`, or named ≥ 2× in title + summary | meeting · both · high · `about` = title |
| Emails | newest 1,500 ids of `emails:by_date` (one ZRANGE), MGET in chunks of 200; match when the contact's `email` equals `sender_email` or appears in `to[]`/`cc[]` (addresses extracted from "Name <addr>"), or, only when the contact has no email on file, when `sender_name` resolves uniquely to the contact | mail · in · high · `about` = subject · `at` = `sent_at` |
| Transcripts (≤ 90 days) | meetings not matched above, newest first, ≤ 40 reads of `meeting:<id>:transcript`; named ≥ 2× | meeting · both · high |
| Done tasks | `status == done`, owner or person resolves to the contact; ≤ 100 newest; `at` = the status→done activity timestamp, else `updatedAt`, else `createdAt` | work · out · medium · `inferred: true` |

Budget: 600 KV commands and 15 s per person (`countingKV`); when either runs out the pass writes what it has and
returns `partial: true`. A typical rescan costs roughly 15–60 commands (3–4 array reads, 1 ZRANGE, ≤ 8 MGETs,
up to 40 transcript GETs, one CAS write). Glimpse, Chronos and Applaud data live on the Mac and are not
reachable here; those arrive through the phase-2 feeds.

## Storage

```
rel:<userHash>:roster            { crew: [RosterEntry], guests: [RosterEntry], updatedAt }   CAS via rel:<userHash>:roster:version
rel:<userHash>:person:<contactId> { touches ≤ 200 newest first, squawks, pinnedTaskIds, mutedSources,
                                    accepted: {source: n}, rejected: {source: n}, seen ≤ 500, rollup, removedAt? }   CAS via …:version
rel:<userHash>:review             zset, score = at (ms), member = ReviewItem JSON, ZREMRANGEBYRANK to 50
```

No `SCAN`; every cron loop bounded by roster size (≤ 100) and a 400-command / 20 s budget. `userHash` = first 16 hex of sha256(userId), as capture receipts use. Implementation: `lib/relationships-store.mjs`, `lib/cas.mjs` (shared compare-and-set), routes under `pages/api/relationships/`, tests in `tests/relationships.test.mjs`.

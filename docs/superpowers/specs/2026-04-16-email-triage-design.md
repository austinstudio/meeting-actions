# Email Triage Screen — Design Spec

**Date:** 2026-04-16
**Feature name:** AI Email Triage / Follow-ups
**Target release:** v5.5 (minor)

## Goal

Give the user an AI-powered view of extracted Outlook emails that surfaces which ones need follow-ups, explains why, and helps compose replies. The raw email data is already being written to Upstash Redis by the `outlook-email-extractor` Rust service — this feature is the consumption side in the Meeting Actions app.

## User flow

1. User runs the extractor locally every now and then; new emails land in Redis.
2. User opens the Triage screen from the sidebar.
3. User clicks **Re-analyze** — AI classifies each email as follow-up-needed or not, assigns priority, and generates an insight explaining why.
4. User works through flagged emails in one of three view modes:
   - **Queue** (default): vertical list of cards sorted by priority + wait time
   - **Focus**: one card at a time, big action buttons
   - **Board**: kanban columns grouped by triage state
5. For any email, the user can: Draft Reply, Snooze, Create Task, Mark Done, Dismiss.
6. **Draft Reply** opens a modal with an AI-generated draft and a **Copy to Clipboard** button. User pastes into Outlook manually.

## Data model

### Existing (owned by extractor, read-only)

| Key | Type | Contents |
|-----|------|----------|
| `email:{outlook_id}` | string (JSON) | Full email: subject, sender, recipients, body, sent_at, attachments |
| `emails:by_date` | sorted set | `outlook_id` ↔ unix timestamp |

### New (owned by this feature)

Single key per user following the existing project pattern (`tasks`, `contacts`, `meetings`).

**Key:** `email-triage:{userId}`
**Value:** object map `{ [outlook_id]: TriageRecord }`

```ts
type TriageRecord = {
  outlookId: string;
  analyzedAt: string;            // ISO 8601 — when AI last ran on this email
  priority: 'high' | 'medium' | 'low';
  needsFollowUp: boolean;        // false means AI saw it and doesn't think action is needed
  insight: string;               // AI reasoning, ~1-2 sentences
  suggestedAction: string;       // short phrase, e.g. "Approve scope or request call"
  deadlineDetected: string|null; // ISO date if AI detected a deadline in the email
  triageState: 'needs_reply' | 'waiting_on' | 'fyi_only' | 'done' | 'dismissed';
  snoozeUntil: string|null;      // ISO date — email hidden from Queue/Focus until this date
  linkedTaskId: string|null;     // if user clicked Create Task, the task it spawned
};
```

Emails without a triage record are treated as un-analyzed. After the first Re-analyze run, every email will have a record; `needsFollowUp: false` emails are hidden from Queue/Focus but visible in Board's FYI column.

## API endpoints

All routes use `requireAuth()` from `lib/auth.js` and return 401 if unauthenticated.

### `GET /api/triage`

Returns the full triage dataset: emails joined with their triage records.

**Query params:**
- `mode`: `queue` | `focus` | `board` (affects which records are included — e.g. Queue hides dismissed and past-snooze)
- `priority`: `high` | `medium` | `low` | `all` (default `all`)
- `sender`: filter by partial sender email match
- `minWaitDays`: number (default 0)

**Response:**
```json
{
  "emails": [{ ...emailFields, "triage": TriageRecord|null }],
  "stats": {
    "total": 142,
    "analyzed": 142,
    "needsReply": 5,
    "waitingOn": 3,
    "fyiOnly": 8,
    "done": 2
  }
}
```

### `POST /api/triage/analyze`

Runs AI analysis. Body: `{ mode: 'all' | 'unanalyzed' }` (default `unanalyzed`).

Iterates emails, calls Gemini with a classification prompt for each, writes/updates triage records. Returns progress summary.

**Response:**
```json
{ "analyzed": 12, "skipped": 130, "errors": 0 }
```

**Prompt shape (Gemini):**
Input includes email subject, sender, recipients, body snippet, sent_at, current date, plus user context (name, active tasks summary from `lib/ai-context.js`). Output is structured JSON matching the `TriageRecord` classification fields. We reuse the existing `@google/generative-ai` setup from `pages/api/ask-ai.js`.

### `PATCH /api/triage/[outlook_id]`

Updates a single triage record. Body accepts any subset of `triageState`, `snoozeUntil`, `priority`, `linkedTaskId`.

### `POST /api/triage/[outlook_id]/draft-reply`

Generates an AI draft reply for one email. Called only when the user clicks Draft Reply.

**Request body:** `{ tone?: 'professional' | 'friendly' | 'brief' }` (default `professional`).

**Response:** `{ draft: "Hi Jane, ..." }`

**Prompt shape:** original email body + user's name + AI context (active tasks, recent meetings) so the draft can reference relevant work. Returns plain-text body suitable for pasting into Outlook.

## UI architecture

### New page

`pages/triage.js` — follows the same structure as `pages/contacts.js` (auth redirect, theme, mobile menu, search/filter bar).

### New components in `components/triage/`

| File | Purpose |
|------|---------|
| `ViewSwitcher.js` | Three-way toggle: Queue / Focus / Board |
| `FilterBar.js` | Priority + sender + wait-duration filters + Re-analyze button |
| `TriageCard.js` | Rich card for Queue mode (priority badge, sender, recipients, snippet, AI insight, action buttons) |
| `FocusCard.js` | Single large card for Focus mode with keyboard-nav (arrow keys advance) |
| `BoardColumn.js` | Kanban column for Board mode; accepts drag-drop from other columns |
| `BoardCard.js` | Compact card for Board columns |
| `DraftReplyModal.js` | Modal: loading → editable textarea with AI draft → Copy to Clipboard |
| `SnoozeMenu.js` | Dropdown: Tomorrow / Next week / Custom date picker |
| `AnalyzeProgressBar.js` | Progress indicator shown during Re-analyze |

### Nav integration

Add a sidebar link in `pages/index.js` and `pages/contacts.js` matching the existing Contacts link pattern. Label: **Follow-ups**. Icon: `Mail` (lucide-react).

### View mode routing

Store mode in URL query param (`?mode=queue|focus|board`) so the current mode survives page reloads and is shareable. Default is `queue`.

Filters also live in URL (`?priority=high&minWaitDays=2`) so the view is bookmarkable.

### Visibility rules across view modes

| View | Shown | Hidden |
|------|-------|--------|
| Queue | `triageState = needs_reply` AND snooze not active | dismissed, done, fyi_only, waiting_on, currently-snoozed |
| Focus | same as Queue | same as Queue |
| Board | all states except dismissed; snoozed items appear in their column with a snooze badge | dismissed |

When `snoozeUntil` is in the past, the item automatically returns to Queue/Focus on next load (no cleanup job needed — the check happens at read time).

### Board mode specifics

- Columns: Needs Reply, Waiting On, FYI Only, Done.
- Drag-drop updates `triageState` via PATCH. No drag library required for v1 — use HTML5 drag events.
- New AI-analyzed emails default to `needs_reply` if `needsFollowUp: true`, otherwise `fyi_only`.
- Users can manually promote an FYI email to Needs Reply by dragging it — this overrides the AI classification.

### Focus mode specifics

- Shows 1-of-N counter at top.
- Arrow keys (← →) navigate; action buttons available; Esc returns to Queue.
- After an action (Snooze/Dismiss/Mark Done), auto-advances to next card.

## Error handling

- **No emails in Redis:** empty state with a message pointing to the extractor repo's README.
- **Re-analyze fails mid-batch:** partial success is persisted; error banner shows count of failures with a Retry button.
- **Draft Reply generation fails:** modal shows error state with Retry + Copy Prompt buttons.
- **AI returns malformed JSON:** catch parse errors per email, store a record with `needsFollowUp: false` and `insight: "Analysis failed"`, surface count in the progress summary.

## What's New entry

Per `CLAUDE.md`, bump `APP_VERSION` to `5.5` in `lib/features.js` and add:

```js
{
  version: 5.5,
  title: 'AI Email Triage',
  description: 'New Follow-ups page uses AI to surface emails needing replies, explains why, and helps draft responses.',
  icon: 'Mail',
  releaseDate: '<release date>'
}
```

Add `Mail` to the icon imports and `FEATURE_ICONS` mapping (note: mapping lives in `components/ui/WhatsNewModal.js` per project memory).

## Out of scope for v1

- Sending emails directly from the app (extractor is read-only).
- Threading / conversation view (each email is triaged individually).
- Bulk analyze on page load — user explicitly wants on-demand only.
- Background cron for analysis.
- `mailto:` integration — copy-to-clipboard only.
- Auto-placing board cards when a related task is marked done.

## Open questions for implementation

- **Draft tone selection:** include a small tone dropdown in the Draft Reply modal (professional / friendly / brief), or start with professional only and add the toggle in a follow-up? → Start with professional, layer in tones later.
- **Contact auto-linking:** when rendering a card, should we surface if the sender matches an existing contact (like we do on the Contacts page for meetings/tasks)? → Yes, low-cost: look up sender email in contacts map, show a "Linked contact" pill that deep-links to the contact detail modal.

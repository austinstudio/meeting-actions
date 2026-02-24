# Mobile Triage View + Board Cleanup

**Date:** 2026-02-24
**Status:** Approved
**Target device:** iPhone 17 Pro (and all mobile < 768px)

## Problem

The app's main task board is desktop-first. On mobile:
- Kanban columns are 85% viewport width, forcing horizontal scrolling
- Task cards have no mobile sizing adjustments
- Filter toolbar is cramped with colliding buttons
- Sidebar is 320px wide (85% of a 375px phone screen)
- The primary mobile workflow — triaging unfiled tasks — requires navigating a full Kanban board

## Design

### Feature 1: Mobile Triage Mode

When opened on mobile (< 768px), the default view is a focused triage mode for Uncategorized tasks.

**Layout:**
- Counter at top: "3 of 12 to triage"
- Centered card showing one unfiled task at a time
- Quick-assign column buttons below the card (pill-shaped, color-coded)
- Skip button to move to next card without assigning
- Delete/archive option (de-emphasized to prevent accidents)
- "View Board" link to switch to Kanban view

**Card content (priority order):**
1. Task title (large, readable)
2. Meeting source + date
3. Due date (with overdue highlighting)
4. Owner
5. Tags (if any)
6. Priority badge

**Interactions:**
- Tap a column button: card animates out, counter updates, next card slides in
- Skip: card slides up and out, next card appears
- All triaged: "All caught up!" empty state with checkmark animation

**Quick-assign buttons:**
- One per column (To Do, In Progress, Waiting, Done, plus custom columns)
- Color-coded to match COLUMN_COLORS
- Horizontally scrollable if more than 4 columns
- Delete button separated below, styled differently (outline/muted)

### Feature 2: Mobile Board Cleanup

When viewing the board on mobile (via "View Board" from triage, or when no unfiled tasks exist):

1. **Column tab strip** — Horizontal scrollable tabs replacing the `w-[85vw]` column scroll. Tap a column name to see its tasks as a vertical list below.

2. **Compact task cards** — Show only: title (1-2 lines), due date, priority dot. Tap to expand.

3. **Slimmer sidebar** — `w-64` (256px) instead of `w-80` (320px).

4. **Toolbar cleanup** — Search and filter in a clean single row. "Ask AI" moves to overflow menu.

5. **Sticky column header** — Column name + task count pinned at top when scrolling tasks.

## Technical Approach

**Mobile detection:** `useIsMobile()` hook checking `window.innerWidth < 768` with resize listener. Same `/` route, conditionally rendered views.

**State:** Reads from existing `tasks` and `columns` state in `index.js`. Task assignment calls existing `handleColumnChange()`. No new API endpoints.

**Animation:** CSS transitions only (transform + opacity). No animation libraries.

**New files:**
- `/components/mobile/MobileTriage.js` — Swipe triage card view
- `/components/mobile/MobileBoard.js` — Tab-based column view
- `/components/mobile/MobileTaskCard.js` — Compact task card

**Modified files:**
- `/pages/index.js` — Mobile detection, conditional rendering
- `/components/task/Column.js` — Minor refactor for reuse

**No new:** API endpoints, database changes, or npm dependencies.

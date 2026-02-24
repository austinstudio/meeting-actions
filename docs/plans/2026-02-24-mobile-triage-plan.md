# Mobile Triage View + Board Cleanup — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mobile-first triage view for quickly assigning uncategorized tasks, plus clean up the existing mobile Kanban board experience.

**Architecture:** On screens < 768px, the app conditionally renders either a triage card view (when there are uncategorized tasks) or a tab-based board view (when viewing columns). Both views read from the same `tasks`/`columns` state in `index.js` and call the same `handleDrop()` function to move tasks between columns. No new API endpoints needed.

**Tech Stack:** Next.js, React, Tailwind CSS (existing stack). CSS transitions for card animations. No new dependencies.

**Design doc:** `docs/plans/2026-02-24-mobile-triage-design.md`

---

### Task 1: Create `useIsMobile` hook

**Files:**
- Create: `hooks/useIsMobile.js`

**Step 1: Create the hook**

```javascript
import { useState, useEffect } from 'react';

export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}
```

**Step 2: Verify**

Run: `npm run dev` — no errors, app still loads.

**Step 3: Commit**

```bash
git add hooks/useIsMobile.js
git commit -m "feat: add useIsMobile hook for responsive mobile views"
```

---

### Task 2: Create `MobileTaskCard` component

**Files:**
- Create: `components/mobile/MobileTaskCard.js`

**Context:** This is a compact task card for mobile. It shows title, meeting source, due date, owner, tags, and priority. Used in both triage and board views.

**Step 1: Create the component**

```jsx
import { Calendar, User, Tag, AlertCircle } from 'lucide-react';
import DueDateBadge from '../ui/DueDateBadge';
import { priorityColors } from '../constants';

export default function MobileTaskCard({ task, meeting, onTap, large = false }) {
  const priorityDot = task.priority && task.priority !== 'none' ? priorityColors[task.priority] : null;

  return (
    <div
      onClick={() => onTap?.(task)}
      className={`bg-white dark:bg-neutral-800 rounded-xl border border-slate-200 dark:border-neutral-700 shadow-sm ${large ? 'p-5' : 'p-3'} ${onTap ? 'active:scale-[0.98] transition-transform' : ''}`}
    >
      {/* Priority + Title */}
      <div className="flex items-start gap-2">
        {priorityDot && (
          <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${task.priority === 'high' ? 'bg-rose-500' : task.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
        )}
        <h3 className={`font-medium text-slate-900 dark:text-white ${large ? 'text-lg leading-snug' : 'text-sm leading-tight line-clamp-2'}`}>
          {task.task}
        </h3>
      </div>

      {/* Meeting source */}
      {meeting && (
        <p className={`text-slate-500 dark:text-neutral-400 mt-1.5 ${large ? 'text-sm' : 'text-xs'}`}>
          From: {meeting.title}
        </p>
      )}

      {/* Meta row: due date + owner */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {task.dueDate && <DueDateBadge dueDate={task.dueDate} compact={!large} />}
        {task.owner && (
          <span className={`flex items-center gap-1 text-slate-500 dark:text-neutral-400 ${large ? 'text-sm' : 'text-xs'}`}>
            <User size={large ? 14 : 12} />
            {task.owner}
          </span>
        )}
      </div>

      {/* Tags */}
      {task.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {task.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-neutral-700 text-slate-600 dark:text-neutral-300">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Context (large only) */}
      {large && task.context && (
        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-3 line-clamp-3">
          {task.context}
        </p>
      )}
    </div>
  );
}
```

**Step 2: Verify**

Not rendered yet — will be used in Task 3 and Task 5. Verify no syntax errors by running `npm run dev`.

**Step 3: Commit**

```bash
git add components/mobile/MobileTaskCard.js
git commit -m "feat: add compact MobileTaskCard component"
```

---

### Task 3: Create `MobileTriage` component

**Files:**
- Create: `components/mobile/MobileTriage.js`

**Context:** This is the main triage view. It receives `tasks` (already filtered to uncategorized only), `columns` (for destination buttons), `meetings` (for meeting lookup), `onAssign(taskId, columnId)` callback, and `onDelete(taskId)` callback. It also receives `onViewBoard()` to switch to the board view.

**Key behavior:**
- Shows one card at a time from the uncategorized tasks
- Tracks current index in local state
- Quick-assign buttons below the card (one per non-uncategorized column)
- Card animates out when assigned (CSS transition on transform/opacity)
- "All caught up" empty state when no tasks remain
- Skip button advances to next card without assigning

**Step 1: Create the component**

```jsx
import { useState, useCallback } from 'react';
import { Check, SkipForward, Trash2, LayoutGrid } from 'lucide-react';
import MobileTaskCard from './MobileTaskCard';
import { COLUMN_COLORS } from '../constants';

const DARK_COLUMN_COLORS = {
  slate: 'bg-slate-700 text-slate-100',
  blue: 'bg-blue-700 text-blue-100',
  amber: 'bg-amber-700 text-amber-100',
  emerald: 'bg-emerald-700 text-emerald-100',
  purple: 'bg-purple-700 text-purple-100',
  rose: 'bg-rose-700 text-rose-100',
  indigo: 'bg-indigo-700 text-indigo-100',
  teal: 'bg-teal-700 text-teal-100',
};

export default function MobileTriage({ tasks, columns, meetings, onAssign, onDelete, onViewBoard, onEditTask }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animatingOut, setAnimatingOut] = useState(null); // 'left' | 'right' | 'up' | null
  const [skippedIds, setSkippedIds] = useState(new Set());

  // Filter out skipped tasks for the current session
  const triageTasks = tasks.filter(t => !skippedIds.has(t.id));
  const currentTask = triageTasks[currentIndex];
  const totalRemaining = triageTasks.length;

  // Destination columns (all columns except uncategorized)
  const destinationColumns = columns
    .filter(c => c.id !== 'uncategorized')
    .sort((a, b) => a.order - b.order);

  const animateAndAdvance = useCallback((direction, callback) => {
    setAnimatingOut(direction);
    setTimeout(() => {
      callback();
      setAnimatingOut(null);
      // If we assigned the last visible task, stay at index 0
      // (the array shrinks, so currentIndex might overshoot)
    }, 300);
  }, []);

  const handleAssign = useCallback((columnId) => {
    if (!currentTask) return;
    const taskId = currentTask.id;
    animateAndAdvance('right', () => {
      onAssign(taskId, columnId);
      // After removing a task from the list, if currentIndex >= new length, wrap to 0
      setCurrentIndex(prev => {
        const newLength = triageTasks.length - 1;
        return prev >= newLength ? 0 : prev;
      });
    });
  }, [currentTask, triageTasks.length, onAssign, animateAndAdvance]);

  const handleSkip = useCallback(() => {
    if (!currentTask) return;
    animateAndAdvance('up', () => {
      setSkippedIds(prev => new Set([...prev, currentTask.id]));
      setCurrentIndex(prev => {
        const newLength = triageTasks.length - 1;
        return prev >= newLength ? 0 : prev;
      });
    });
  }, [currentTask, triageTasks.length, animateAndAdvance]);

  const handleDelete = useCallback(() => {
    if (!currentTask) return;
    const taskId = currentTask.id;
    animateAndAdvance('left', () => {
      onDelete(taskId);
      setCurrentIndex(prev => {
        const newLength = triageTasks.length - 1;
        return prev >= newLength ? 0 : prev;
      });
    });
  }, [currentTask, triageTasks.length, onDelete, animateAndAdvance]);

  const getColumnButtonColor = (color) => {
    const lightColors = {
      slate: 'bg-slate-100 text-slate-700 border-slate-300',
      blue: 'bg-blue-50 text-blue-700 border-blue-300',
      amber: 'bg-amber-50 text-amber-700 border-amber-300',
      emerald: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      purple: 'bg-purple-50 text-purple-700 border-purple-300',
      rose: 'bg-rose-50 text-rose-700 border-rose-300',
      indigo: 'bg-indigo-50 text-indigo-700 border-indigo-300',
      teal: 'bg-teal-50 text-teal-700 border-teal-300',
    };
    return lightColors[color] || lightColors.slate;
  };

  const getDarkColumnButtonColor = (color) => {
    const darkColors = {
      slate: 'dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600',
      blue: 'dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-700',
      amber: 'dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700',
      emerald: 'dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700',
      purple: 'dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-700',
      rose: 'dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-700',
      indigo: 'dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-700',
      teal: 'dark:bg-teal-900/50 dark:text-teal-300 dark:border-teal-700',
    };
    return darkColors[color] || darkColors.slate;
  };

  // Empty state: all caught up
  if (totalRemaining === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
          <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">All caught up!</h2>
        <p className="text-slate-500 dark:text-neutral-400 mb-6">No uncategorized tasks to triage.</p>
        <button
          onClick={onViewBoard}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-orange-500 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform"
        >
          <LayoutGrid size={16} />
          View Board
        </button>
      </div>
    );
  }

  const meeting = currentTask?.meetingId
    ? meetings.find(m => m.id === currentTask.meetingId)
    : null;

  const cardTransform = animatingOut === 'right'
    ? 'translate-x-full opacity-0'
    : animatingOut === 'left'
    ? '-translate-x-full opacity-0'
    : animatingOut === 'up'
    ? '-translate-y-full opacity-0'
    : 'translate-x-0 opacity-100';

  return (
    <div className="flex flex-col h-full px-4 pt-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Triage</h2>
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            {currentIndex + 1} of {totalRemaining} to sort
          </p>
        </div>
        <button
          onClick={onViewBoard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <LayoutGrid size={16} />
          Board
        </button>
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div
          className={`w-full max-w-sm transition-all duration-300 ease-out ${cardTransform}`}
        >
          <MobileTaskCard task={currentTask} meeting={meeting} large onTap={() => onEditTask?.(currentTask)} />
        </div>
      </div>

      {/* Quick-assign buttons */}
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2 justify-center">
          {destinationColumns.map(col => (
            <button
              key={col.id}
              onClick={() => handleAssign(col.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border active:scale-95 transition-all ${getColumnButtonColor(col.color)} ${getDarkColumnButtonColor(col.color)}`}
            >
              {col.label}
            </button>
          ))}
        </div>

        {/* Secondary actions */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={handleSkip}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
          >
            <SkipForward size={16} />
            Skip
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 dark:text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run `npm run dev` — no build errors.

**Step 3: Commit**

```bash
git add components/mobile/MobileTriage.js
git commit -m "feat: add MobileTriage swipe-card component for mobile task triage"
```

---

### Task 4: Create `MobileBoard` component

**Files:**
- Create: `components/mobile/MobileBoard.js`

**Context:** Tab-based column view for mobile. Horizontal scrollable tab strip at top, vertical task list below for the selected column. Uses MobileTaskCard in compact mode.

**Step 1: Create the component**

```jsx
import { useState, useRef, useEffect } from 'react';
import { Inbox } from 'lucide-react';
import MobileTaskCard from './MobileTaskCard';
import { COLUMN_COLORS } from '../constants';

export default function MobileBoard({ tasks, columns, meetings, onEditTask, onViewTriage, unfiledCount }) {
  const [activeColumnId, setActiveColumnId] = useState(() => columns[0]?.id || 'uncategorized');
  const tabsRef = useRef(null);
  const activeTabRef = useRef(null);

  // Scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && tabsRef.current) {
      const tab = activeTabRef.current;
      const container = tabsRef.current;
      const tabLeft = tab.offsetLeft;
      const tabWidth = tab.offsetWidth;
      const containerWidth = container.offsetWidth;
      const scrollLeft = container.scrollLeft;

      if (tabLeft < scrollLeft) {
        container.scrollTo({ left: tabLeft - 16, behavior: 'smooth' });
      } else if (tabLeft + tabWidth > scrollLeft + containerWidth) {
        container.scrollTo({ left: tabLeft + tabWidth - containerWidth + 16, behavior: 'smooth' });
      }
    }
  }, [activeColumnId]);

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  const columnTasks = tasks
    .filter(t => t.status === activeColumnId && !t.deleted && !t.archived)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
    });

  const getTabColor = (color, isActive) => {
    if (!isActive) return 'text-slate-500 dark:text-neutral-400';
    const map = {
      slate: 'text-slate-700 dark:text-slate-200 border-slate-500 dark:border-slate-400',
      blue: 'text-blue-700 dark:text-blue-300 border-blue-500 dark:border-blue-400',
      amber: 'text-amber-700 dark:text-amber-300 border-amber-500 dark:border-amber-400',
      emerald: 'text-emerald-700 dark:text-emerald-300 border-emerald-500 dark:border-emerald-400',
      purple: 'text-purple-700 dark:text-purple-300 border-purple-500 dark:border-purple-400',
      rose: 'text-rose-700 dark:text-rose-300 border-rose-500 dark:border-rose-400',
      indigo: 'text-indigo-700 dark:text-indigo-300 border-indigo-500 dark:border-indigo-400',
      teal: 'text-teal-700 dark:text-teal-300 border-teal-500 dark:border-teal-400',
    };
    return map[color] || map.slate;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Triage banner (if unfiled tasks exist) */}
      {unfiledCount > 0 && (
        <button
          onClick={onViewTriage}
          className="flex items-center justify-between mx-3 mt-3 px-4 py-2.5 bg-indigo-50 dark:bg-orange-900/20 border border-indigo-200 dark:border-orange-800 rounded-xl text-sm active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center gap-2">
            <Inbox size={16} className="text-indigo-600 dark:text-orange-400" />
            <span className="font-medium text-indigo-700 dark:text-orange-300">{unfiledCount} tasks to triage</span>
          </span>
          <span className="text-indigo-500 dark:text-orange-400">&rarr;</span>
        </button>
      )}

      {/* Column tabs */}
      <div
        ref={tabsRef}
        className="flex gap-1 overflow-x-auto px-3 pt-3 pb-1 scrollbar-none"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {sortedColumns.map(col => {
          const isActive = col.id === activeColumnId;
          const count = tasks.filter(t => t.status === col.id && !t.deleted && !t.archived).length;
          return (
            <button
              key={col.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => setActiveColumnId(col.id)}
              className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? `bg-white dark:bg-neutral-800 shadow-sm border border-slate-200 dark:border-neutral-700 ${getTabColor(col.color, true)}`
                  : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800'
              }`}
            >
              {col.label}
              <span className={`ml-1.5 text-xs ${isActive ? 'opacity-70' : 'opacity-50'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-4 space-y-2">
        {columnTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-400 dark:text-neutral-500 text-sm">No tasks in this column</p>
          </div>
        ) : (
          columnTasks.map(task => {
            const meeting = task.meetingId ? meetings.find(m => m.id === task.meetingId) : null;
            return (
              <MobileTaskCard
                key={task.id}
                task={task}
                meeting={meeting}
                onTap={() => onEditTask?.(task)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Run `npm run dev` — no build errors.

**Step 3: Commit**

```bash
git add components/mobile/MobileBoard.js
git commit -m "feat: add MobileBoard tab-based column view"
```

---

### Task 5: Integrate mobile views into `pages/index.js`

**Files:**
- Modify: `pages/index.js`

**Context:** This is the main integration point. We need to:
1. Import `useIsMobile` hook and mobile components
2. Add a `mobileView` state ('triage' | 'board')
3. Conditionally render mobile views vs desktop Kanban when `isMobile` is true
4. Pass existing handlers (`handleDrop`, `handleDeleteTask`, `setEditingTask`) to mobile components

**Step 1: Add imports at the top of `pages/index.js`**

After the existing imports (around line 21), add:

```javascript
import useIsMobile from '../hooks/useIsMobile';
import MobileTriage from '../components/mobile/MobileTriage';
import MobileBoard from '../components/mobile/MobileBoard';
```

**Step 2: Add state and hook inside `MeetingKanban` component**

After the existing state declarations (around line 68), add:

```javascript
const isMobile = useIsMobile();
const [mobileView, setMobileView] = useState('triage'); // 'triage' | 'board'
```

**Step 3: Compute uncategorized tasks**

After the `filteredTasks` computation (around line 923), add:

```javascript
const unfiledTasks = tasks.filter(t => t.status === 'uncategorized' && !t.deleted && !t.archived);
```

**Step 4: Create a mobile assign handler**

After the existing handlers (around line 814), add:

```javascript
const handleMobileAssign = useCallback((taskId, columnId) => {
  handleDrop(taskId, columnId);
}, [handleDrop]);
```

Note: `handleDrop(taskId, newStatus, targetIndex)` — passing without targetIndex appends to end of column, which is the correct behavior for triage.

**Step 5: Wrap the main content area with mobile conditional**

In the JSX, find the `<main>` element (around line 1379). Wrap the main content area so that on mobile, we render either MobileTriage or MobileBoard instead of the desktop Kanban board.

Replace the `<main>` block (lines ~1379-1563) with a conditional:

```jsx
<main className="flex-1 overflow-hidden h-[calc(100vh-73px)] md:h-[calc(100vh-93px)] flex flex-col">
  {isMobile ? (
    // Mobile views
    mobileView === 'triage' && unfiledTasks.length > 0 ? (
      <MobileTriage
        tasks={unfiledTasks}
        columns={columns}
        meetings={meetings}
        onAssign={handleMobileAssign}
        onDelete={handleDeleteTask}
        onViewBoard={() => setMobileView('board')}
        onEditTask={(task) => setEditingTask(task)}
      />
    ) : (
      <MobileBoard
        tasks={filteredTasks}
        columns={columns}
        meetings={meetings}
        onEditTask={(task) => setEditingTask(task)}
        onViewTriage={() => setMobileView('triage')}
        unfiledCount={unfiledTasks.length}
      />
    )
  ) : (
    // Desktop: existing Kanban board (keep all existing content)
    <>
      {/* Filters - Compact single row with dropdowns */}
      <div className="p-3 md:p-6 overflow-x-auto flex-1 flex flex-col">
        {/* ... all existing filter bar and kanban board JSX stays here unchanged ... */}
      </div>
    </>
  )}
</main>
```

**Important:** The existing `<main>` has `p-3 md:p-6 overflow-x-auto`. Move those padding classes to an inner wrapper inside the desktop branch so mobile views control their own padding.

**Step 6: Verify**

1. Run `npm run dev`
2. Open browser at localhost, resize to mobile width (< 768px)
3. Verify: triage view shows when there are uncategorized tasks
4. Verify: tapping a column button calls handleDrop and moves to next card
5. Verify: "Board" button switches to tab view
6. Verify: desktop view is unchanged at full width

**Step 7: Commit**

```bash
git add pages/index.js
git commit -m "feat: integrate mobile triage and board views into main page"
```

---

### Task 6: Mobile board cleanup — sidebar and toolbar fixes

**Files:**
- Modify: `pages/index.js`

**Step 1: Slim down mobile sidebar**

Find the sidebar container (around line 1145). Change `w-80` to `w-64 md:w-80`:

```
Before: className="fixed md:relative ... w-80 ..."
After:  className="fixed md:relative ... w-64 md:w-80 ..."
```

Also update the mobile backdrop area if the sidebar width is referenced.

**Step 2: Hide "Ask AI" button on mobile**

Find the AI suggestions bar / "Ask AI" button in the toolbar area. Add `hidden md:flex` or `hidden md:inline-flex` to hide it on mobile screens.

**Step 3: Verify**

1. Open mobile view, check sidebar is narrower (256px vs 320px)
2. Check toolbar doesn't overflow on mobile
3. Desktop view is unchanged

**Step 4: Commit**

```bash
git add pages/index.js
git commit -m "fix: slim mobile sidebar to 256px and clean up mobile toolbar"
```

---

### Task 7: Auto-switch to board when no unfiled tasks

**Files:**
- Modify: `pages/index.js`

**Context:** When the user opens the app on mobile and there are zero uncategorized tasks, they should see the board view directly (not an empty triage view). Also, when they finish triaging all tasks, auto-switch to board.

**Step 1: Add effect to auto-switch**

After the `mobileView` state declaration, add:

```javascript
useEffect(() => {
  if (isMobile && mobileView === 'triage' && unfiledTasks.length === 0) {
    setMobileView('board');
  }
}, [isMobile, unfiledTasks.length, mobileView]);
```

**Step 2: Verify**

1. With zero uncategorized tasks, opening mobile view shows board
2. After triaging last task, view auto-switches to board
3. Tapping "triage" banner in board view switches back to triage

**Step 3: Commit**

```bash
git add pages/index.js
git commit -m "feat: auto-switch mobile view to board when no tasks to triage"
```

---

### Task 8: Update What's New modal

**Files:**
- Modify: `lib/features.js`
- Possibly modify: `components/ui/WhatsNewModal.js` (for new icon)

**Context:** Per CLAUDE.md instructions, ask user about release type first. This is a significant new feature (mobile triage mode), likely a **minor** version bump.

**Step 1: Ask user about version**

Before changing anything, confirm with user whether this is a major, minor, or patch release.

**Step 2: Update `APP_VERSION` and add feature entry**

In `lib/features.js`, increment version and add a new entry at the top of the FEATURES array:

```javascript
{
  version: X.X,  // new version number
  title: 'Mobile Triage Mode',
  description: 'Quickly sort through unfiled tasks on your phone with a card-based triage view. Plus a cleaner mobile board with tab navigation.',
  icon: 'Smartphone',
  releaseDate: '2026-02-24'
}
```

**Step 3: Verify the icon**

Check that 'Smartphone' is in the `FEATURE_ICONS` mapping in `components/ui/WhatsNewModal.js`. It was already added for a previous feature. If not, add it.

**Step 4: Commit**

```bash
git add lib/features.js
git commit -m "feat: add Mobile Triage Mode to What's New (vX.X)"
```

---

### Task 9: Final verification and polish

**Files:**
- All mobile components and index.js

**Step 1: Test on actual mobile or DevTools mobile emulator**

1. Open Chrome DevTools → Toggle Device Toolbar → iPhone 14 Pro (or similar ~393px width)
2. Test full triage flow: see card → tap column → card animates → next card → repeat until "All caught up"
3. Test board view: tab switching, task list scrolling, tapping tasks to edit
4. Test switching between triage and board
5. Test sidebar opens/closes properly at narrower width
6. Test dark mode in both views
7. Test with zero tasks, one task, and many tasks

**Step 2: Fix any visual issues found during testing**

Common things to watch for:
- Card not centered vertically
- Buttons too small for touch (minimum 44px tap target)
- Text overflow on long task titles
- Dark mode color mismatches
- Animation jank

**Step 3: Final commit**

```bash
git add -A
git commit -m "polish: mobile triage and board visual refinements"
```

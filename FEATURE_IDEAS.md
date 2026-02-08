# Feature Ideas for Meeting Actions App

## High Impact, Medium Complexity

<!-- ### 1. Search & Quick Find
Complete - Global search across tasks and meetings
- Filter by date range, priority, keywords
- Search within meeting transcripts -->

### 2. Due Date Intelligence
- Visual calendar view of upcoming tasks
- Smart reminders (browser notifications for overdue/due soon) ----- USE TEXT?
- "This week", "Next week", "Overdue" quick filters
- Recurring tasks (weekly 1:1s, monthly reviews). ------ Might be good
- Daily overdue digest via ntfy + Vercel Cron  ------ USE TEXT?

### 3. Task Dependencies
- Link tasks that block each other
- Visual indicators when prerequisites aren't complete
- Auto-suggest related tasks from same meeting

### 4. Bulk Operations
- Multi-select tasks (checkbox mode)
- Bulk edit (change owner, due date, priority)
- Bulk move to different column
- Bulk delete/archive
- PRIORITY - Bulk imports of PDF/TXT documents

### 5. Comments & Activity Log
Complete - Add notes/updates to tasks
Complete - See task history (who changed what, when)
Complete - @mention people in comments

## High Impact, Lower Complexity

### 6. Keyboard Shortcuts
- Quick add task (cmd+k)
- Navigate between columns (arrow keys)
- Mark complete (cmd+enter)
- Search (cmd+f)

### 7. Task Templates
- Save common task patterns
- One-click to create "Send meeting notes", "Schedule follow-up", etc.
- Meeting type templates with pre-filled tasks

### 8. Export & Reporting
- Export to CSV, PDF, Markdown
- Weekly digest email of completed/pending tasks
- Generate meeting minutes with action items
- Print-friendly view

### 9. Smart Suggestions
- AI suggests tasks that might be stale ("Sarah hasn't responded in 5 days")
- Auto-bump priority when due date approaches
- Suggest archiving old completed tasks

### 10. Tags/Labels
COMPLETE - Add custom tags (#urgent, #client, #bug, #feature)
COMPLETE - Color-coded labels
COMPLETE - Filter by tags
TEST - Auto-tag based on meeting content
PRIORITY - Cleaner design for filters and tags

## Medium Impact, Higher Value

### 11. Calendar Integration
- Sync with Google Calendar/Outlook
- See tasks on calendar by due date
- Create tasks directly from calendar events
- Import meeting attendees automatically

### 12. Email Integration
- Email daily digest of your tasks
- Forward emails to create tasks
- Email task updates to stakeholders
- Send reminder emails to task owners

### 13. Subtasks/Checklists
COMPLETE - Break down complex tasks into steps
COMPLETE - Show progress (3/5 subtasks complete)
COMPLETE - Collapse/expand subtasks

### 14. Time Tracking
- Log time spent on tasks
- Estimate vs actual time
- View total time per meeting/week
- Pomodoro timer integration

### 15. Team Dashboard
- See everyone's workload
- Team capacity planning
- Who's blocked on whom
- Overdue tasks by person

## Quick Wins (Low Complexity)

### 16. UI Enhancements
- Dark mode
- Compact/comfortable view density
- Custom card colors per priority
- Drag to reorder tasks within column
- Pin important tasks to top

### 17. Better Mobile Experience
- Responsive design improvements
- Mobile-optimized modals
- Swipe gestures for task actions
- PWA for offline access

### 18. Data Improvements
- Undo/redo actions
- Restore deleted tasks (trash bin)
- Duplicate task
- Convert meeting notes to tasks manually

### 19. Statistics & Insights
- Completion rate over time
- Average tasks per meeting
- Most common task types
- Time to completion metrics
- Personal productivity trends

### 20. Integration Improvements
- Slack notifications for new/overdue tasks
- Webhook support for other apps
- API for external integrations
- Chrome extension for quick capture

---

## Priority Order (Recommended)

1. **Search & Quick Find** - Essential as your data grows
2. **Keyboard Shortcuts** - Makes power users much faster
3. **Smart Due Date Reminders** - Ensures nothing falls through cracks
4. **Bulk Operations** - Saves time managing multiple tasks
5. **Tags/Labels** - Adds flexible organization without rigid structure


PHONE INTERACTION....

1. Daily overdue digest via ntfy + Vercel Cron — low effort since the ntfy infra is already wired up                               
  2. Export to CSV — quick win for getting data out
  3. Silent data limit warning — so you don't lose meetings without knowing                                                          
  4. Breaking up index.js — would make your auto-implement bot more reliable since it would be editing smaller, focused files instead
   of a 4800-line monolith

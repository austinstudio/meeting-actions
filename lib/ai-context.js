// lib/ai-context.js
// Shared context builder for AI features (used by ask-ai and suggestions endpoints)

export function buildContext(tasks, meetings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeTasks = tasks.filter(t => !t.deleted && !t.archived);
  const tasksByStatus = {};
  activeTasks.forEach(t => {
    if (!tasksByStatus[t.status]) tasksByStatus[t.status] = [];
    tasksByStatus[t.status].push(t);
  });

  // Calculate some stats
  const overdueTasks = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today && t.status !== 'done';
  });

  const dueTodayTasks = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() === today.getTime() && t.status !== 'done';
  });

  const dueThisWeek = activeTasks.filter(t => {
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    return due > today && due <= weekFromNow && t.status !== 'done';
  });

  // Build context string with task IDs for referencing
  let context = `TODAY'S DATE: ${today.toISOString().split('T')[0]}\n\n`;

  context += `TASK SUMMARY:\n`;
  context += `- Total active tasks: ${activeTasks.length}\n`;
  context += `- Overdue: ${overdueTasks.length}\n`;
  context += `- Due today: ${dueTodayTasks.length}\n`;
  context += `- Due this week: ${dueThisWeek.length}\n`;
  context += `- Completed: ${(tasksByStatus['done'] || []).length}\n\n`;

  context += `TASKS BY STATUS:\n`;
  for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
    context += `\n[${status.toUpperCase()}] (${statusTasks.length} tasks):\n`;
    statusTasks.slice(0, 30).forEach(t => {
      const meeting = meetings.find(m => m.id === t.meetingId);
      // Include task ID for referencing
      context += `- [ID:${t.id}] "${t.task}" | Owner: ${t.owner} | Due: ${t.dueDate} | Priority: ${t.priority} | Status: ${t.status}`;
      if (t.type === 'follow-up' && t.person) context += ` | Follow-up with: ${t.person}`;
      if (meeting) context += ` | From: ${meeting.title}`;
      if (t.tags?.length) context += ` | Tags: ${t.tags.join(', ')}`;
      context += `\n`;
    });
    if (statusTasks.length > 30) {
      context += `  ... and ${statusTasks.length - 30} more\n`;
    }
  }

  context += `\nRECENT MEETINGS (${meetings.length} total):\n`;
  meetings.slice(0, 10).forEach(m => {
    const meetingTasks = activeTasks.filter(t => t.meetingId === m.id);
    context += `- [ID:${m.id}] "${m.title}" (${m.date}) - ${meetingTasks.length} tasks`;
    if (m.participants?.length) context += ` | Participants: ${m.participants.join(', ')}`;
    context += `\n`;
  });

  return { context, tasks: activeTasks, meetings };
}

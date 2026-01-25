// pages/api/tasks/[id].js
// Update, archive, or delete individual tasks
// Includes comments and activity logging

import { kv } from '@vercel/kv';

// Helper to generate activity log entry
function createActivityEntry(type, field, oldValue, newValue, user = 'Corey') {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type, // 'update', 'comment', 'create', 'archive'
    field,
    oldValue,
    newValue,
    user,
    timestamp: new Date().toISOString()
  };
}

// Field labels for activity log
const fieldLabels = {
  status: 'Status',
  priority: 'Priority',
  task: 'Description',
  owner: 'Owner',
  person: 'Follow-up person',
  dueDate: 'Due date',
  context: 'Context',
  type: 'Type',
  archived: 'Archived'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  // GET - Get single task with comments and activity
  if (req.method === 'GET') {
    try {
      const tasks = await kv.get('tasks') || [];
      const task = tasks.find(t => t.id === id);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.status(200).json({ success: true, task });
    } catch (error) {
      console.error('Task get error:', error);
      return res.status(500).json({ error: 'Failed to get task' });
    }
  }

  // POST - Add a comment to the task
  if (req.method === 'POST') {
    try {
      const { comment, user = 'Corey' } = req.body;

      if (!comment || !comment.trim()) {
        return res.status(400).json({ error: 'Comment is required' });
      }

      let tasks = await kv.get('tasks') || [];
      const taskIndex = tasks.findIndex(t => t.id === id);

      if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Initialize arrays if they don't exist
      if (!tasks[taskIndex].comments) tasks[taskIndex].comments = [];
      if (!tasks[taskIndex].activity) tasks[taskIndex].activity = [];

      // Create comment
      const newComment = {
        id: `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: comment.trim(),
        user,
        timestamp: new Date().toISOString()
      };

      // Add comment
      tasks[taskIndex].comments.push(newComment);

      // Add activity entry
      tasks[taskIndex].activity.push(
        createActivityEntry('comment', null, null, comment.trim(), user)
      );

      tasks[taskIndex].updatedAt = new Date().toISOString();

      await kv.set('tasks', tasks);

      return res.status(200).json({
        success: true,
        comment: newComment,
        task: tasks[taskIndex]
      });
    } catch (error) {
      console.error('Add comment error:', error);
      return res.status(500).json({ error: 'Failed to add comment' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { status, priority, archived, column, task, owner, person, dueDate, context, type, tags, subtasks, pinned, order } = req.body;

      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];

      // Find the task
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const currentTask = tasks[taskIndex];

      // Initialize activity array if it doesn't exist
      if (!currentTask.activity) currentTask.activity = [];
      if (!currentTask.comments) currentTask.comments = [];

      // Track changes and create activity entries
      const changes = [];

      if (status !== undefined && status !== currentTask.status) {
        changes.push(createActivityEntry('update', 'status', currentTask.status, status));
        currentTask.status = status;
      }
      if (priority !== undefined && priority !== currentTask.priority) {
        changes.push(createActivityEntry('update', 'priority', currentTask.priority, priority));
        currentTask.priority = priority;
      }
      if (task !== undefined && task !== currentTask.task) {
        changes.push(createActivityEntry('update', 'task', currentTask.task, task));
        currentTask.task = task;
      }
      if (owner !== undefined && owner !== currentTask.owner) {
        changes.push(createActivityEntry('update', 'owner', currentTask.owner, owner));
        currentTask.owner = owner;
      }
      if (person !== undefined && person !== currentTask.person) {
        changes.push(createActivityEntry('update', 'person', currentTask.person, person));
        currentTask.person = person;
      }
      if (dueDate !== undefined && dueDate !== currentTask.dueDate) {
        changes.push(createActivityEntry('update', 'dueDate', currentTask.dueDate, dueDate));
        currentTask.dueDate = dueDate;
      }
      if (context !== undefined && context !== currentTask.context) {
        changes.push(createActivityEntry('update', 'context', currentTask.context, context));
        currentTask.context = context;
      }
      if (type !== undefined && type !== currentTask.type) {
        changes.push(createActivityEntry('update', 'type', currentTask.type, type));
        currentTask.type = type;
      }
      if (archived !== undefined && archived !== currentTask.archived) {
        changes.push(createActivityEntry('update', 'archived', currentTask.archived, archived));
        currentTask.archived = archived;
        if (archived) {
          currentTask.archivedAt = new Date().toISOString();
        }
      }
      if (column !== undefined) currentTask.column = column;

      // Handle tags array
      if (tags !== undefined) {
        const oldTags = currentTask.tags || [];
        const newTags = Array.isArray(tags) ? tags : [];
        if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) {
          changes.push(createActivityEntry('update', 'tags', oldTags.join(', '), newTags.join(', ')));
          currentTask.tags = newTags;
        }
      }

      // Handle subtasks array
      if (subtasks !== undefined) {
        const oldSubtasks = currentTask.subtasks || [];
        const newSubtasks = Array.isArray(subtasks) ? subtasks : [];
        // Only log if count changed significantly
        if (oldSubtasks.length !== newSubtasks.length) {
          changes.push(createActivityEntry('update', 'subtasks', `${oldSubtasks.length} items`, `${newSubtasks.length} items`));
        }
        currentTask.subtasks = newSubtasks;
      }

      // Handle pinned status
      if (pinned !== undefined && pinned !== currentTask.pinned) {
        changes.push(createActivityEntry('update', 'pinned', currentTask.pinned ? 'yes' : 'no', pinned ? 'yes' : 'no'));
        currentTask.pinned = pinned;
        currentTask.pinnedAt = pinned ? new Date().toISOString() : null;
      }

      // Handle order for drag reorder
      if (order !== undefined) {
        currentTask.order = order;
      }

      // Add all changes to activity log
      currentTask.activity.push(...changes);

      // Keep only last 50 activity entries per task to prevent bloat
      if (currentTask.activity.length > 50) {
        currentTask.activity = currentTask.activity.slice(-50);
      }

      currentTask.updatedAt = new Date().toISOString();
      tasks[taskIndex] = currentTask;

      // Save back to KV
      await kv.set('tasks', tasks);

      return res.status(200).json({
        success: true,
        task: currentTask
      });
    } catch (error) {
      console.error('Task update error:', error);
      return res.status(500).json({ error: 'Failed to update task' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { permanent } = req.body || {};

      // Get current tasks from KV
      let tasks = await kv.get('tasks') || [];

      // Find the task
      const taskIndex = tasks.findIndex(t => t.id === id);
      if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' });
      }

      if (permanent) {
        // Permanently delete
        tasks = tasks.filter(t => t.id !== id);
      } else {
        // Soft delete - move to trash
        tasks[taskIndex].deleted = true;
        tasks[taskIndex].deletedAt = new Date().toISOString();

        // Add activity entry
        if (!tasks[taskIndex].activity) tasks[taskIndex].activity = [];
        tasks[taskIndex].activity.push(
          createActivityEntry('delete', null, null, 'moved to trash')
        );
      }

      // Save back to KV
      await kv.set('tasks', tasks);

      return res.status(200).json({ success: true, task: tasks[taskIndex] });
    } catch (error) {
      console.error('Task delete error:', error);
      return res.status(500).json({ error: 'Failed to delete task' });
    }
  }

  // PUT - Restore a deleted task
  if (req.method === 'PUT') {
    try {
      const { restore } = req.body;

      if (!restore) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      let tasks = await kv.get('tasks') || [];
      const taskIndex = tasks.findIndex(t => t.id === id);

      if (taskIndex === -1) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Restore the task
      tasks[taskIndex].deleted = false;
      tasks[taskIndex].deletedAt = null;

      // Add activity entry
      if (!tasks[taskIndex].activity) tasks[taskIndex].activity = [];
      tasks[taskIndex].activity.push(
        createActivityEntry('restore', null, null, 'restored from trash')
      );

      tasks[taskIndex].updatedAt = new Date().toISOString();

      await kv.set('tasks', tasks);

      return res.status(200).json({ success: true, task: tasks[taskIndex] });
    } catch (error) {
      console.error('Task restore error:', error);
      return res.status(500).json({ error: 'Failed to restore task' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

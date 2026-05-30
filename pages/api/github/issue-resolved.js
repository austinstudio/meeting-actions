// pages/api/github/issue-resolved.js
// Webhook endpoint called by the auto-implement GitHub Action.
// Authenticates via shared bearer secret (AUTO_IMPLEMENT_WEBHOOK_SECRET).
// Finds the task tied to the issue, stamps a resolution record, and
// moves it to the Done or Failures column based on outcome.

import { kv } from '@vercel/kv';

const VALID_OUTCOMES = new Set(['success', 'failed', 'needs_clarification', 'needs_deps']);
const MAX_ACTIVITY = 50;

function createActivityEntry(type, newValue, user = 'Auto-implement bot') {
  return {
    id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    field: null,
    oldValue: null,
    newValue,
    user,
    timestamp: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.AUTO_IMPLEMENT_WEBHOOK_SECRET;
  if (!secret) {
    console.error('AUTO_IMPLEMENT_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { issueNumber, outcome, summary, analysis } = req.body || {};

  if (issueNumber === undefined || issueNumber === null) {
    return res.status(400).json({ error: 'issueNumber required' });
  }
  if (!VALID_OUTCOMES.has(outcome)) {
    return res.status(400).json({ error: `outcome must be one of ${[...VALID_OUTCOMES].join(', ')}` });
  }

  try {
    let tasks = await kv.get('tasks') || [];
    const issueNum = Number(issueNumber);
    const taskIndex = tasks.findIndex(t => Number(t.githubIssueNumber) === issueNum);

    if (taskIndex === -1) {
      return res.status(200).json({
        success: true,
        matched: false,
        message: `No task linked to issue #${issueNum}`,
      });
    }

    const task = tasks[taskIndex];
    const previousStatus = task.status;

    task.githubResolution = {
      outcome,
      summary: summary || null,
      analysis: analysis || null,
      resolvedAt: new Date().toISOString(),
    };

    // Move to Done on success, or the user's Failures column on failure.
    // For needs_clarification / needs_deps we leave the task where it is
    // because the user still has to act on it.
    let targetStatus = null;
    if (outcome === 'success') {
      targetStatus = 'done';
    } else if (outcome === 'failed') {
      const allColumns = await kv.get('columns') || [];
      const failuresCol = allColumns.find(
        c => c.userId === task.userId && c.custom && c.label?.toLowerCase() === 'failures'
      );
      if (failuresCol) targetStatus = failuresCol.id;
    }

    if (targetStatus && targetStatus !== previousStatus) {
      task.status = targetStatus;
    }

    if (!task.activity) task.activity = [];
    task.activity.push(
      createActivityEntry(
        'auto-implement',
        `Auto-implement outcome: ${outcome}${targetStatus ? ` (moved to ${targetStatus})` : ''}`
      )
    );
    if (task.activity.length > MAX_ACTIVITY) {
      task.activity = task.activity.slice(-MAX_ACTIVITY);
    }

    task.updatedAt = new Date().toISOString();

    tasks[taskIndex] = task;
    await kv.set('tasks', tasks);

    return res.status(200).json({
      success: true,
      matched: true,
      taskId: task.id,
      moved: targetStatus !== null && targetStatus !== previousStatus,
      previousStatus,
      newStatus: task.status,
    });
  } catch (error) {
    console.error('issue-resolved error:', error);
    return res.status(500).json({ error: 'Failed to record resolution' });
  }
}

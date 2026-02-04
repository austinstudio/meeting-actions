// pages/api/github/create-issue.js
// Create GitHub issue from task data

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'austinstudio';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'meeting-actions';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    // Get user's GitHub connection
    const connections = await kv.get('githubConnections') || [];
    const connection = connections.find(c => c.userId === userId);

    if (!connection) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    const { task, owner, dueDate, priority, type, context } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'Task description required' });
    }

    // Build issue labels
    const labels = [];
    if (type === 'bug') labels.push('bug');
    if (type === 'enhancement') labels.push('enhancement');
    if (priority === 'high') labels.push('priority: high');

    // Build issue body
    const bodyParts = ['## Task Details', ''];
    if (owner) bodyParts.push(`**Owner:** ${owner}`);
    if (dueDate) bodyParts.push(`**Due Date:** ${dueDate}`);
    if (priority) bodyParts.push(`**Priority:** ${priority}`);
    bodyParts.push('');

    if (context) {
      bodyParts.push('## Context');
      bodyParts.push(context);
      bodyParts.push('');
    }

    bodyParts.push('---');
    bodyParts.push('*Created from Meeting Actions task*');

    const issueBody = bodyParts.join('\n');

    // Create issue via GitHub API
    const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${connection.githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: task,
        body: issueBody,
        labels: labels,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('GitHub API error:', errorData);
      return res.status(response.status).json({
        error: 'Failed to create issue',
        details: errorData.message
      });
    }

    const issue = await response.json();

    return res.status(200).json({
      success: true,
      issueUrl: issue.html_url,
      issueNumber: issue.number,
    });
  } catch (error) {
    console.error('Create issue error:', error);
    return res.status(500).json({ error: 'Failed to create issue' });
  }
}

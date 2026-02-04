// pages/api/github/issue-status.js
// Fetch GitHub issue status and latest bot comments

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'austinstudio';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'meeting-actions';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { issueNumber } = req.query;

  if (!issueNumber) {
    return res.status(400).json({ error: 'Issue number required' });
  }

  try {
    // Get user's GitHub token
    const connections = await kv.get('githubConnections') || [];
    const connection = connections.find(c => c.userId === userId);

    if (!connection) {
      return res.status(400).json({ error: 'GitHub not connected' });
    }

    // Fetch issue details
    const issueResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${connection.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!issueResponse.ok) {
      return res.status(issueResponse.status).json({ error: 'Failed to fetch issue' });
    }

    const issue = await issueResponse.json();

    // Fetch comments
    const commentsResponse = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`,
      {
        headers: {
          'Authorization': `Bearer ${connection.githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    const comments = commentsResponse.ok ? await commentsResponse.json() : [];

    // Find bot comments (from github-actions[bot])
    const botComments = comments.filter(c =>
      c.user?.login === 'github-actions[bot]' ||
      c.user?.type === 'Bot'
    );

    // Determine status based on latest bot comment
    let status = 'pending'; // No bot comment yet
    let statusMessage = 'Waiting for auto-implementation to start...';
    let lastBotComment = null;

    if (botComments.length > 0) {
      lastBotComment = botComments[botComments.length - 1];
      const body = lastBotComment.body;

      if (body.includes('✅')) {
        status = 'success';
        statusMessage = 'Changes deployed successfully';
      } else if (body.includes('⚠️') && body.includes('allow-deps')) {
        status = 'needs-approval';
        statusMessage = 'Requires approval to add dependencies';
      } else if (body.includes('❌')) {
        status = 'failed';
        statusMessage = 'Auto-implementation failed';
      } else {
        status = 'in-progress';
        statusMessage = 'Processing...';
      }
    }

    // Check if there's a running workflow (issue is open and no final bot comment)
    const isOpen = issue.state === 'open';
    const hasWorkflowLabel = issue.labels?.some(l => l.name === 'auto-implement');

    if (isOpen && status === 'pending') {
      // Check if workflow might be running by looking at issue age
      const createdAt = new Date(issue.created_at);
      const now = new Date();
      const ageMinutes = (now - createdAt) / 1000 / 60;

      if (ageMinutes < 10) {
        status = 'in-progress';
        statusMessage = 'Auto-implementing...';
      }
    }

    return res.status(200).json({
      status,
      statusMessage,
      issueState: issue.state,
      issueTitle: issue.title,
      lastBotComment: lastBotComment ? {
        body: lastBotComment.body,
        createdAt: lastBotComment.created_at,
      } : null,
      labels: issue.labels?.map(l => l.name) || [],
    });

  } catch (error) {
    console.error('Issue status error:', error);
    return res.status(500).json({ error: 'Failed to fetch issue status' });
  }
}

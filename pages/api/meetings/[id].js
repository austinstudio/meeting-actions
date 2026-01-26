// pages/api/meetings/[id].js
// Edit or delete a meeting

import { kv } from '@vercel/kv';
import { requireAuth } from '../../../lib/auth';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  // PATCH - Update meeting details (title, date, participants)
  if (req.method === 'PATCH') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      const { title, date, participants } = req.body;

      let meetings = await kv.get('meetings') || [];

      // Find the meeting (must belong to user)
      const meetingIndex = meetings.findIndex(m => m.id === id && m.userId === userId);
      if (meetingIndex === -1) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      // Update fields if provided
      if (title !== undefined) {
        meetings[meetingIndex].title = title;
      }
      if (date !== undefined) {
        meetings[meetingIndex].date = date;
      }
      if (participants !== undefined) {
        meetings[meetingIndex].participants = Array.isArray(participants) ? participants : [];
      }

      meetings[meetingIndex].updatedAt = new Date().toISOString();

      await kv.set('meetings', meetings);

      return res.status(200).json({
        success: true,
        meeting: meetings[meetingIndex]
      });
    } catch (error) {
      console.error('Meeting update error:', error);
      return res.status(500).json({ error: 'Failed to update meeting' });
    }
  }

  if (req.method === 'DELETE') {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    try {
      // Get current data from KV
      let meetings = await kv.get('meetings') || [];
      let tasks = await kv.get('tasks') || [];

      // Check if meeting exists and belongs to user
      const meetingIndex = meetings.findIndex(m => m.id === id && m.userId === userId);
      if (meetingIndex === -1) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      // Remove the meeting
      const deletedMeeting = meetings[meetingIndex];
      meetings = meetings.filter(m => m.id !== id);

      // Remove all tasks associated with this meeting (that belong to user)
      const deletedTaskCount = tasks.filter(t => t.meetingId === id && t.userId === userId).length;
      tasks = tasks.filter(t => !(t.meetingId === id && t.userId === userId));

      // Save back to KV
      await kv.set('meetings', meetings);
      await kv.set('tasks', tasks);

      return res.status(200).json({
        success: true,
        deletedMeeting: deletedMeeting.title,
        deletedTaskCount
      });
    } catch (error) {
      console.error('Meeting delete error:', error);
      return res.status(500).json({ error: 'Failed to delete meeting' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

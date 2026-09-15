// pages/api/meetings/[id].js
// Edit or delete a meeting

import { kv } from '@vercel/kv';
import { updateTasks } from '../../../lib/task-store.mjs';
import { requireAuth } from '../../../lib/auth';
import { deleteTranscript, updateMeetings } from '../../../lib/meeting-store';

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

      // Edit under compare-and-set (lib/meeting-store.js): a capture committing its daily meeting
      // between our read and write makes this retry on fresh data instead of erasing that meeting.
      const outcome = await updateMeetings(kv, meetings => {
        const meetingIndex = meetings.findIndex(m => m.id === id && m.userId === userId);
        if (meetingIndex === -1) return null;
        const meeting = { ...meetings[meetingIndex] };
        if (title !== undefined) meeting.title = title;
        if (date !== undefined) meeting.date = date;
        if (participants !== undefined) meeting.participants = Array.isArray(participants) ? participants : [];
        meeting.updatedAt = new Date().toISOString();
        const next = meetings.slice();
        next[meetingIndex] = meeting;
        return { meetings: next, meeting };
      });
      if (!outcome) return res.status(404).json({ error: 'Meeting not found' });

      return res.status(200).json({
        success: true,
        meeting: outcome.meeting
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
      // Remove the meeting under compare-and-set (lib/meeting-store.js)
      const outcome = await updateMeetings(kv, meetings => {
        const deletedMeeting = meetings.find(m => m.id === id && m.userId === userId);
        if (!deletedMeeting) return null;
        return { meetings: meetings.filter(m => m.id !== id), deletedMeeting };
      });
      if (!outcome) return res.status(404).json({ error: 'Meeting not found' });
      const { deletedMeeting } = outcome;
      // Remove the meeting's tasks under compare-and-set (lib/task-store.mjs)
      const { deletedTaskCount } = await updateTasks(kv, tasks => ({
        tasks: tasks.filter(t => !(t.meetingId === id && t.userId === userId)),
        deletedTaskCount: tasks.filter(t => t.meetingId === id && t.userId === userId).length,
      }));
      await deleteTranscript(id);

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

// pages/api/meetings/[id].js
// Delete a meeting and all its associated tasks

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (req.method === 'DELETE') {
    try {
      // Get current data from KV
      let meetings = await kv.get('meetings') || [];
      let tasks = await kv.get('tasks') || [];
      
      // Check if meeting exists
      const meetingIndex = meetings.findIndex(m => m.id === id);
      if (meetingIndex === -1) {
        return res.status(404).json({ error: 'Meeting not found' });
      }
      
      // Remove the meeting
      const deletedMeeting = meetings[meetingIndex];
      meetings = meetings.filter(m => m.id !== id);
      
      // Remove all tasks associated with this meeting
      const deletedTaskCount = tasks.filter(t => t.meetingId === id).length;
      tasks = tasks.filter(t => t.meetingId !== id);
      
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

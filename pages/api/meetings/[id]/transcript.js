// pages/api/meetings/[id]/transcript.js
// On-demand transcript fetch. Transcripts are stored outside the `meetings`
// blob (see lib/meeting-store.js) so the board payload stays small.

import { requireAuth } from '../../../../lib/auth';
import { getMeetings, getTranscript } from '../../../../lib/meeting-store';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { id } = req.query;

  try {
    const meetings = await getMeetings();
    const meeting = meetings.find(m => m.id === id && m.userId === userId);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Legacy records created before the split may still carry the transcript inline.
    const transcript = meeting.transcript ?? (await getTranscript(id));
    return res.status(200).json({ id, transcript: transcript || null });
  } catch (error) {
    console.error('Transcript fetch error:', error);
    return res.status(500).json({ error: 'Failed to load transcript' });
  }
}

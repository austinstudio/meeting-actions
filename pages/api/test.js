// pages/api/test.js
// A simple endpoint to test the extraction with a sample transcript

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST method' });
  }

  // Sample transcript for testing
  const sampleTranscript = `
Meeting started at 2:00 PM.

Sarah: Okay, let's go through the sprint items. The authentication flow redesign is the top priority this week.

Marcus: Yeah, I've got the wireframes ready. Corey, can you review those by end of day Thursday? We need sign-off before dev starts.

Corey: Sure, I'll block time tomorrow afternoon for that. What about the tech debt items we discussed last week?

Sarah: Good question. I think we should schedule a separate session with the dev leads to prioritize those. Can you set that up for sometime next week?

Corey: Will do. I'll send out a calendar invite by Friday.

Marcus: One more thing - we're still waiting on the API specs from the backend team. I'll ping them today but we might need to escalate if we don't hear back by Monday.

Sarah: Let me know if you need me to reach out to their manager. Oh, and Corey - can you send me the updated capacity numbers for the team? I need those for the stakeholder meeting tomorrow.

Corey: I'll get those to you by end of day today.

Sarah: Perfect. I think that covers everything. Let's sync again Thursday to check progress.

Meeting ended at 2:25 PM.
`;

  // Forward to the webhook endpoint
  const webhookUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/webhook`;
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: req.body.transcript || sampleTranscript,
        title: req.body.title || 'Test Meeting',
        date: new Date().toISOString().split('T')[0]
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

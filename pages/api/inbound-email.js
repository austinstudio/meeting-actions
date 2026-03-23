// pages/api/inbound-email.js
// Receives parsed email data from the Cloudflare Email Worker
// Verifies the shared secret and logs the payload for now

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Email-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify shared secret
  const secret = req.headers['x-email-secret'];
  if (!secret || secret !== process.env.INBOUND_EMAIL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { from, to, subject, date, text, html, headers, attachments } = req.body;

    if (!from || !subject) {
      return res.status(400).json({ error: 'Missing required fields: from, subject' });
    }

    // Log the inbound email for now — business logic will be added later
    console.log('--- Inbound Email Received ---');
    console.log('From:', from);
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Date:', date);
    console.log('Text length:', text?.length || 0);
    console.log('HTML length:', html?.length || 0);
    console.log('Attachments:', attachments?.length || 0);
    console.log('------------------------------');

    return res.status(200).json({
      success: true,
      message: 'Email received',
      summary: {
        from,
        to,
        subject,
        date,
        textLength: text?.length || 0,
        attachmentCount: attachments?.length || 0
      }
    });
  } catch (error) {
    console.error('Inbound email processing error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

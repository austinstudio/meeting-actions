export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.VERCEL_WEBHOOK_SECRET;
  if (secret && req.headers['x-vercel-signature'] !== secret) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const { type, payload } = req.body;

    if (type === 'deployment.succeeded') {
      const name = payload?.deployment?.meta?.githubCommitMessage || payload?.deployment?.name || 'Unknown';
      await sendNtfy('Vercel deploy complete', `Deployed: ${name}`, 'rocket');
    } else if (type === 'deployment.error') {
      const name = payload?.deployment?.meta?.githubCommitMessage || payload?.deployment?.name || 'Unknown';
      await sendNtfy('Vercel deploy failed', `Failed: ${name}`, 'x', 'high');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendNtfy(title, body, tags, priority) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.error('NTFY_TOPIC not set');
    return;
  }

  const headers = {
    'Title': title,
    'Tags': tags,
  };
  if (priority) {
    headers['Priority'] = priority;
  }

  await fetch(`https://ntfy.sh/${topic}`, {
    method: 'POST',
    headers,
    body,
  });
}

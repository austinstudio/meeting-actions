import PostalMime from 'postal-mime';

export default {
  async email(message, env) {
    const parser = new PostalMime();
    const rawEmail = new Response(message.raw);
    const rawBuffer = await rawEmail.arrayBuffer();
    const parsed = await parser.parse(rawBuffer);

    const payload = {
      from: message.from,
      to: message.to,
      subject: parsed.subject || '',
      date: parsed.date || new Date().toISOString(),
      text: parsed.text || '',
      html: parsed.html || '',
      headers: Object.fromEntries(
        (parsed.headers || []).map(h => [h.key, h.value])
      ),
      attachments: (parsed.attachments || []).map(a => ({
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.content?.byteLength || 0,
        content: a.content ? arrayBufferToBase64(a.content) : null
      }))
    };

    const response = await fetch(env.WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Email-Secret': env.INBOUND_EMAIL_SECRET
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
      message.setReject(`Webhook returned ${response.status}`);
    }
  }
};

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}


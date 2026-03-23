import PostalMime from 'postal-mime';

export default {
  async email(message, env) {
    const parser = new PostalMime();
    const rawEmail = await streamToArrayBuffer(message.raw);
    const parsed = await parser.parse(rawEmail);

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
        size: a.content?.byteLength || 0
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

async function streamToArrayBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.byteLength;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk.buffer || chunk), offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}

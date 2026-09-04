// lib/alerts.js
// Push alerts to ntfy (same topic as the daily digest) when an ingest path fails.
// Why: the Aug 2026 KV-limit outage silently dropped every Plaud/email/Applaud
// import for three weeks. Any 5xx or thrown error on an ingest route now pings
// the phone immediately.

const NTFY_TOPIC = process.env.NTFY_TOPIC || 'ma-builds-notify-07211976';
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

/**
 * Fire-and-forget alert. Never throws; never delays the response by more than ~5s.
 * @param {string} source   e.g. 'inbound-email', 'applaud-webhook', 'quick-capture', 'plaud-webhook'
 * @param {unknown} error   Error or message
 * @param {object} [detail] small context object (subject, title, recording id…)
 */
export async function notifyIngestFailure(source, error, detail = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const lines = [message.slice(0, 400)];
  for (const [k, v] of Object.entries(detail)) {
    if (v !== undefined && v !== null && v !== '') lines.push(`${k}: ${String(v).slice(0, 160)}`);
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(NTFY_URL, {
      method: 'POST',
      headers: {
        'Title': `Meeting Actions: ${source} ingest failed`,
        'Priority': '4',
        'Tags': 'warning,rotating_light',
        'Click': 'https://tasks.usdc.design',
      },
      body: lines.join('\n'),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (e) {
    console.error('ntfy alert failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * Wrap a Pages API handler so an uncaught throw becomes a 500 *and* an alert.
 */
export function withIngestAlert(source, handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error(`${source} error:`, error);
      await notifyIngestFailure(source, error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : String(error) });
      }
    }
  };
}

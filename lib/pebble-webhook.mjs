// lib/pebble-webhook.mjs
// Pure helpers for pages/api/pebble-webhook.js — the Pebble Index "Hold & Talk" webhook receiver.
// Discovery phase (Sep 2026): we do not yet know the wire format the Pebble phone app posts, so the
// route records a *shape summary* of each delivery (never the audio bytes, never auth headers) that the
// owner can read back with GET. Once the format is known, this module grows the real ingest mapping and
// the route keeps the same URL, so the Pebble app never has to be reconfigured.

export const MAX_BODY_BYTES = 25 * 1024 * 1024;
export const MAX_RUNS = 10;
const TEXT_KEEP = 20_000;      // full transcription text is worth keeping
const STRING_PREVIEW = 160;    // any other long string is previewed, not stored

const HEADER_ALLOW = /^(content-type|content-length|user-agent|accept|x-.*|pebble-.*|idempotency-key|date)$/i;
// Vercel/proxy plumbing: request ids, geo/IP, and x-vercel-sc-headers (which embeds an internal bearer token).
const HEADER_DENY = /^(x-vercel-.*|x-forwarded-.*|x-real-ip|x-invocation-id|x-matched-path|x-middleware-.*|x-nextjs-.*)$/i;

/** Headers worth recording: the sender's own (x-index-*, user-agent, content-*). Never auth, cookies, or proxy internals. */
export function pickHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!HEADER_ALLOW.test(k) || HEADER_DENY.test(k) || /authorization|cookie|signature|secret|token/i.test(k)) continue;
    const value = Array.isArray(v) ? v.join(', ') : String(v);
    if (/bearer\s|eyJ[A-Za-z0-9_-]{10,}/i.test(value)) continue;   // a token hiding in an allowed header
    out[k.toLowerCase()] = value.slice(0, 300);
  }
  return out;
}

/** Guess an audio/container format from the first bytes. */
export function sniffMagic(buf) {
  if (!buf || buf.length < 4) return null;
  const head = buf.subarray(0, 12);
  const ascii = head.toString('latin1');
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return 'wav';
  if (ascii.startsWith('OggS')) return 'ogg';
  if (ascii.startsWith('fLaC')) return 'flac';
  if (ascii.slice(4, 8) === 'ftyp') return 'mp4/m4a';
  if (ascii.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3';
  if (ascii.startsWith('{') || ascii.startsWith('[')) return 'json';
  return null;
}

const B64 = /^[A-Za-z0-9+/=\r\n_-]+$/;

/** Replace long strings with a preview so a base64 clip never lands in KV; keep transcription-like text. */
export function redactValue(value, key = '', depth = 0) {
  if (depth > 6) return '<nested>';
  if (typeof value === 'string') {
    const looksLikeText = /transcri|text|note|memo|summary|title|content/i.test(key);
    if (value.length <= STRING_PREVIEW) return value;
    if (looksLikeText && !B64.test(value.slice(0, 512))) return value.slice(0, TEXT_KEEP);
    const base64 = B64.test(value.slice(0, 512));
    let magic = null;
    if (base64) { try { magic = sniffMagic(Buffer.from(value.slice(0, 64), 'base64')); } catch { /* ignore */ } }
    return `<string len=${value.length}${base64 ? ' base64' : ''}${magic ? ` looks=${magic}` : ''} head="${value.slice(0, 24)}">`;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v, i) => redactValue(v, key, depth + 1)).concat(value.length > 20 ? [`<+${value.length - 20} more>`] : []);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactValue(v, k, depth + 1);
    return out;
  }
  return value;
}

/** Minimal multipart/form-data splitter: part names, filenames, types, sizes, magic — not the bytes. */
export function summarizeMultipart(buf, contentType) {
  const m = /boundary="?([^";]+)"?/i.exec(contentType || '');
  if (!m) return { error: 'no boundary in content-type' };
  const boundary = Buffer.from(`--${m[1]}`);
  const parts = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.subarray(start, start + 2).toString() === '--') break;
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const next = buf.indexOf(boundary, headerEnd);
    const bodyStart = headerEnd + 4;
    const bodyEnd = next === -1 ? buf.length : next - 2; // strip CRLF before the next boundary
    const rawHeaders = buf.subarray(start, headerEnd).toString('utf8');
    const name = /name="([^"]*)"/i.exec(rawHeaders)?.[1] ?? null;
    const filename = /filename="([^"]*)"/i.exec(rawHeaders)?.[1] ?? null;
    const type = /content-type:\s*([^\r\n]+)/i.exec(rawHeaders)?.[1]?.trim() ?? null;
    const body = buf.subarray(bodyStart, Math.max(bodyStart, bodyEnd));
    const part = { name, filename, contentType: type, bytes: body.length, magic: sniffMagic(body) };
    if (!filename && body.length <= TEXT_KEEP && (!type || /^text\/|json/i.test(type))) {
      const text = body.toString('utf8');
      part.value = /^\s*[\[{]/.test(text) ? safeJSON(text) : text;
    }
    parts.push(part);
    pos = next;
  }
  return { parts };
}

function safeJSON(text) {
  try { return redactValue(JSON.parse(text)); } catch { return text.slice(0, TEXT_KEEP); }
}

/**
 * One delivery → a small JSON-safe record. `body` is a Buffer of the raw request body.
 */
export function summarizeDelivery({ method, url, headers, body, receivedAt = new Date().toISOString() }) {
  const contentType = String(headers?.['content-type'] || '');
  const summary = {
    receivedAt, method, path: url ? String(url).split('?')[0] : null,
    query: url && url.includes('?') ? url.split('?')[1].slice(0, 500) : null,
    headers: pickHeaders(headers), contentType, bytes: body ? body.length : 0,
  };
  if (!body || body.length === 0) { summary.kind = 'empty'; return summary; }
  if (/multipart\/form-data/i.test(contentType)) {
    summary.kind = 'multipart';
    Object.assign(summary, summarizeMultipart(body, contentType));
  } else if (/json/i.test(contentType) || sniffMagic(body) === 'json') {
    summary.kind = 'json';
    const text = body.toString('utf8');
    try {
      const parsed = JSON.parse(text);
      summary.json = redactValue(parsed);
      summary.keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : null;
    } catch (e) { summary.parseError = e.message; summary.textPreview = text.slice(0, 1000); }
  } else if (/^application\/x-www-form-urlencoded/i.test(contentType)) {
    summary.kind = 'form';
    summary.form = redactValue(Object.fromEntries(new URLSearchParams(body.toString('utf8'))));
  } else if (/^text\//i.test(contentType)) {
    summary.kind = 'text';
    summary.text = body.toString('utf8').slice(0, TEXT_KEEP);
  } else {
    summary.kind = 'binary';
    summary.magic = sniffMagic(body);
    summary.head = body.subarray(0, 16).toString('hex');
  }
  return summary;
}

/** Newest first, capped. */
export function appendRun(runs, summary, max = MAX_RUNS) {
  return [summary, ...(Array.isArray(runs) ? runs : [])].slice(0, max);
}

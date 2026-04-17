// lib/triage-ignore.js
// Helpers for matching senders against the ignore list.

// Entry shapes:
//   { type: 'email',   pattern: 'noreply@figma.com', createdAt: '...' }
//   { type: 'domain',  pattern: 'figma.com',         createdAt: '...' }

export function normalizeSender(addr) {
  return (addr || '').toLowerCase().trim();
}

export function domainOf(addr) {
  const a = normalizeSender(addr);
  const i = a.indexOf('@');
  return i >= 0 ? a.slice(i + 1) : '';
}

export function matchesIgnoreEntry(senderEmail, entry) {
  const addr = normalizeSender(senderEmail);
  if (!addr || !entry) return false;
  if (entry.type === 'email') return addr === normalizeSender(entry.pattern);
  if (entry.type === 'domain') return domainOf(addr) === normalizeSender(entry.pattern);
  return false;
}

export function shouldIgnore(senderEmail, ignoreList) {
  if (!Array.isArray(ignoreList) || ignoreList.length === 0) return false;
  return ignoreList.some(e => matchesIgnoreEntry(senderEmail, e));
}

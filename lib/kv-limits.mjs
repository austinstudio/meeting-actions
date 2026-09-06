// Upstash/Vercel KV rejects requests above 10 MB. Shared by every writer of the large arrays.
export const KV_MAX_REQUEST_BYTES = 10 * 1024 * 1024;
export const SAFETY_MARGIN_BYTES = 256 * 1024;

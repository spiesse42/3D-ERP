export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function escapeRecord(record = {}) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]));
}
export function veiligeUrl(value) {
  if (!value) return null;
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
// Layer 6 of the security stack: input sanitization against prompt injection.
// User text goes to Claude wrapped in tags; strip anything that tries to
// break out of them or smuggle instructions.

const MAX_MESSAGE_LEN = 2000;

export function sanitizeForAI(raw: string): string {
  return raw
    .slice(0, MAX_MESSAGE_LEN)
    // strip tag-like sequences that could fake system/tool structure
    .replace(/<\/?[a-z_:-]+>/gi, ' ')
    // collapse control chars
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ')
    .trim();
}

export function sanitizeField(raw: unknown, maxLen = 300): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[<>]/g, '').slice(0, maxLen).trim();
}

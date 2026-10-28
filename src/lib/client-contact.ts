// Client contact captured from chat: phone and address are free text an owner
// dictates, but an email has a shape. Validate it once, here, so every writer
// (parse route, template seed, a future editor) agrees: an unusable address is
// null — never an error, and never invented.
import { sanitizeField } from './sanitize';

/** Mirrors invoices_client_email_len_chk (max RFC 5321 path length). */
export const MAX_CLIENT_EMAIL_CHARS = 254;

// One @, a dotted domain, no whitespace or characters that break a mailto/print.
const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

/** Trimmed, sanitized email, or null when it isn't a usable address.
 *  Spaces AROUND an @ or a dot are dictation noise and are dropped
 *  ("deffeu @ gmail.com"); a space anywhere else means it isn't an address
 *  ("a b@c.com" must not silently become "ab@c.com"). */
export function normalizeClientEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = sanitizeField(raw, MAX_CLIENT_EMAIL_CHARS).replace(/\s*([@.])\s*/g, '$1');
  if (!email || email.length > MAX_CLIENT_EMAIL_CHARS || /\s/.test(email)) return null;
  return EMAIL.test(email) ? email : null;
}

import 'server-only';
import { timingSafeEqual } from 'node:crypto';

// Shared auth gate for the Vercel Cron targets (/api/followups,
// /api/trial-reminders). Vercel injects `Authorization: Bearer ${CRON_SECRET}`
// on scheduled invocations; every other request must be rejected so the public
// URLs are inert.
//
// Fail closed: if CRON_SECRET is unset or blank, NOBODY is authorized. The old
// inline check compared against `Bearer ${process.env.CRON_SECRET}`, which with
// an unset secret became the literal string "Bearer undefined" — a value an
// attacker could send verbatim to pass. Here a missing/blank secret returns
// false unconditionally.
//
// Constant-time compare (timingSafeEqual) so the check can't be turned into a
// byte-by-byte timing oracle for the secret. timingSafeEqual throws on
// length-mismatched buffers, so the length is checked first.
export function verifyCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim() === '') return false;

  const provided = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

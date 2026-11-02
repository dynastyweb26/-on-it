// ═══ Receipt attach on a bank row — the rules, without a database ═══
//
// The client never sends a storage path. It sends the content hash it already
// computes for a receipt (lib/receipt.ts) and the server rebuilds the object key
// from the caller's own id: `${user.id}/${hash}.jpg`. So the only thing that can
// enter from a request is 64 lowercase hex characters, and a path belonging to
// another user is not expressible.
//
// Everything here is pure: no Supabase, no fetch, no storage. The route downloads
// the object and hands the bytes to verifyReceipt(); the refusals it returns are
// the route's 422/409 answers, so the copy and the checks cannot drift apart.
//
// Mirrors the estimates attachments confirm route (src/app/api/estimates/[id]/
// attachments/confirm/route.ts): the client's Content-Type is never trusted, the
// real bytes are measured, sniffed and hashed server-side.
import { createHash } from 'node:crypto';

/** The column's CHECK is `^[0-9a-f]{64}$` (expenses_receipt_hash_fmt). */
export const RECEIPT_HASH_RE = /^[0-9a-f]{64}$/;

/** A downscaled receipt is well under 1 MB (lib/receipt.ts targets 900 KB), so
 *  5 MB is already generous — it only has to catch someone bypassing the client
 *  pipeline and pushing a raw photo straight at the bucket. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/** Every way a receipt can be refused. These strings are both the `fail()` kind
 *  and the body's `error`, so the client switches on one value. */
export type ReceiptRefusal =
  | 'receipt_invalid'
  | 'receipt_missing'
  | 'receipt_too_large'
  | 'receipt_not_jpeg'
  | 'receipt_mismatch'
  | 'receipt_duplicate';

export const RECEIPT_BUCKET = 'receipts';

export function isReceiptHash(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_HASH_RE.test(value);
}

/** Reject keys a browser, proxy or storage backend could normalise differently
 *  from Postgres' string comparison. A path we build ourselves can never contain
 *  these, so this is defence in depth, not the primary check — the same posture
 *  as hasUnsafeKeySegments() in the estimates confirm route. */
export function hasUnsafeKeySegments(path: string): boolean {
  if (!path || path.includes('\\')) return true;
  return path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

/**
 * The one place an object key is built. Returns null for anything that is not a
 * lowercase sha256 or not a UUID owner — the caller answers 422 and never touches
 * storage.
 */
export function receiptObjectPath(userId: unknown, hash: unknown): string | null {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) return null;
  if (!isReceiptHash(hash)) return null;
  const path = `${userId}/${hash}.jpg`;
  return hasUnsafeKeySegments(path) ? null : path;
}

/** JPEG magic: FF D8 FF. The pipeline always re-encodes to JPEG, so anything
 *  else at this path is not a receipt we wrote. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function sha256HexBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The server-side verdict on the stored object. `null` includes the missing
 * case because a download that returned nothing is the same answer as no object.
 *
 * Order matters: size before sniff before hash, so an oversized upload never
 * gets hashed and a wrong-type file is named as such rather than as a mismatch.
 */
export function verifyReceipt(bytes: Uint8Array | null, hash: unknown): ReceiptRefusal | null {
  if (!isReceiptHash(hash)) return 'receipt_invalid';
  if (!bytes || bytes.byteLength === 0) return 'receipt_missing';
  if (bytes.byteLength > MAX_RECEIPT_BYTES) return 'receipt_too_large';
  if (!isJpeg(bytes)) return 'receipt_not_jpeg';
  if (sha256HexBytes(bytes) !== hash) return 'receipt_mismatch';
  return null;
}

/** A 23505 from the expenses insert is ambiguous (replay vs. a receipt already on
 *  another expense), so the constraint NAME decides. PostgREST puts the index
 *  name in `message`/`details`; anything else keeps the existing replay-adopt
 *  path so a double tap still lands on the expense it already made. */
export function uniqueViolation(
  error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): 'receipt_hash' | 'plaid_transaction_id' | 'other' {
  if (!error || error.code !== '23505') return 'other';
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  if (text.includes('expenses_user_receipt_hash_idx')) return 'receipt_hash';
  if (text.includes('expenses_user_plaid_transaction_uidx')) return 'plaid_transaction_id';
  return 'other';
}

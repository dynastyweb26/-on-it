// ═══ Unattached payment — money in with no invoice behind it ═══
// A payment the owner received that no invoice explains: a job paid outside On
// It, a family loan repaid, a vendor refund they count as income. It is stored
// as an other_income row with classification 'other_income', the value every
// Collected reader already sums, so it needs no invoice and changes no invoice.
//
// The row's shape and the input rules live here, pure, so the route and (later)
// any card agree on what is accepted, and so "there is no invoice field here"
// is a property a test can hold.
//
// Idempotency: a submission carries one key. The pair (user_id, key) is unique
// in the database (partial index on other_income), so a retry writes one row.
// The key deliberately has no invoice id in it: there is no invoice.
import { INCOME_AMOUNT_MAX, isIsoDay } from './income-form';
import { OTHER_INCOME_TITLE_MAX } from './other-income';
import type { PaymentMethod } from './record-payment';

/** The methods the card offers. The database also accepts the legacy cash/check. */
export const UNATTACHED_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'card', 'bank', 'zelle', 'cashapp', 'paypal', 'venmo', 'other',
];

/**
 * What the row is called when the owner types no name. The table requires a
 * title, and an unlabelled income row is not a record; this is the neutral one.
 */
export const UNATTACHED_PAYMENT_TITLE = 'Other income';

/** The partial unique index that makes one submission one row. */
export const UNATTACHED_INCOME_IDEMPOTENCY_CONSTRAINT = 'other_income_user_idempotency_key_uidx';

export type UnattachedPaymentInput = {
  amount: number;
  method: PaymentMethod;
  /** The day the money arrived, yyyy-mm-dd, in the owner's local calendar. */
  received_on: string;
  /** The name the owner typed, or UNATTACHED_PAYMENT_TITLE. Never empty. */
  title: string;
};

export type UnattachedErrorCode =
  | 'amount_invalid'
  | 'method_invalid'
  | 'date_invalid'
  | 'title_too_long';

export type UnattachedParseResult =
  | { ok: true; value: UnattachedPaymentInput }
  | { ok: false; code: UnattachedErrorCode };

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function isUnattachedMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string'
    && (UNATTACHED_PAYMENT_METHODS as readonly string[]).includes(value);
}

/**
 * Validate one save. `amount` accepts a number or a numeric string (the card
 * sends either); `title` is optional and falls back to the neutral name.
 */
export function parseUnattachedPayment(body: unknown): UnattachedParseResult {
  const row = (body ?? {}) as Record<string, unknown>;
  const amount = typeof row.amount === 'number' ? row.amount : Number(clean(row.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > INCOME_AMOUNT_MAX) {
    return { ok: false, code: 'amount_invalid' };
  }
  // Cents, never a float tail: the column is numeric(12,2).
  const rounded = Math.round(amount * 100) / 100;
  if (!isUnattachedMethod(row.method)) return { ok: false, code: 'method_invalid' };
  if (!isIsoDay(row.received_on)) return { ok: false, code: 'date_invalid' };
  const title = clean(row.title) || UNATTACHED_PAYMENT_TITLE;
  if (title.length > OTHER_INCOME_TITLE_MAX) return { ok: false, code: 'title_too_long' };
  return {
    ok: true,
    value: { amount: rounded, method: row.method, received_on: row.received_on, title },
  };
}

/**
 * A key for one submission: stable for retries, unique across submissions.
 * No invoice id is part of it — this payment has no invoice. `uuid` is
 * injectable so tests can pin the value.
 */
export function unattachedPaymentKey(uuid?: string): string {
  const id = uuid ?? (
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
  return `income-${id}`;
}

/** The other_income row an unattached payment writes. No invoice column exists. */
export function unattachedInsertRow(
  userId: string,
  input: UnattachedPaymentInput,
  idempotencyKey: string,
) {
  return {
    user_id: userId,
    amount: input.amount,
    title: input.title,
    client_name: null,
    received_on: input.received_on,
    note: null,
    // Manual by definition: a row a bank deposit decided is never written here.
    deposit_id: null,
    classification: 'other_income' as const,
    method: input.method,
    idempotency_key: idempotencyKey,
  };
}

/** The columns a replay reads back to prove the key owns this same money. */
export type UnattachedPaymentRow = {
  id: string;
  amount: number | string;
  received_on: string;
  method?: string | null;
  idempotency_key?: string | null;
};

/**
 * True when the row a key already owns is different money. The comparator is
 * amount + the day it arrived; there is no invoice to compare.
 */
export function isDifferentUnattachedPayment(
  existing: UnattachedPaymentRow,
  row: { amount: number; received_on: string },
): boolean {
  return Number(existing.amount) !== Number(row.amount)
    || existing.received_on !== row.received_on;
}

interface Errorish {
  code?: string | number | null;
  message?: string | null;
  details?: string | null;
}

/**
 * True only for a repeat of the same submission: Postgres 23505 raised by the
 * idempotency index. The constraint NAME decides, so a primary-key or check
 * violation is never mistaken for a safe repeat.
 */
export function isUnattachedIdempotencyConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Errorish;
  if (String(e.code ?? '') !== '23505') return false;
  return `${e.message ?? ''} ${e.details ?? ''}`.includes(UNATTACHED_INCOME_IDEMPOTENCY_CONSTRAINT);
}

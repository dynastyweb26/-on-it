// ═══ Record-payment: UI selection → the recordPayment input ═══
// The invoice-detail bottom sheet owns only PRESENTATION. The mapping from the
// user's taps to the { amount, method, paid_at } the ledger insert needs lives
// here, pure and tested, so the sheet can never drift from the save path.
//
// paid_at is built the same way the page always built it: a bare YYYY-MM-DD is
// a LOCAL calendar date, converted from its parts (never UTC) so a payment
// entered in the evening is stored and shown on the local day.

import { classifyError, ERROR_MESSAGE, type ErrorKind } from '@/lib/errors';

// Selectable methods only. Legacy `cash` and `check` rows remain valid in the
// ledger and display via lib/payment-methods, but are no longer offered here:
// a manual cash/check payment is recorded as `other`.
export type PaymentMethod = 'card' | 'bank' | 'zelle' | 'cashapp' | 'paypal' | 'venmo' | 'other';
export type PayMode = 'full' | 'deposit' | 'other';
export type PayDateMode = 'today' | 'yesterday' | 'other';

export interface RecordPaymentInput {
  amount: number;
  method: PaymentMethod;
  /** ISO timestamp for the local calendar date at local midnight. */
  paidAt: string;
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'other', label: 'Other' },
];

export function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date → its LOCAL calendar date "YYYY-MM-DD". */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD" → ISO timestamp from its LOCAL parts (not UTC). */
export function localDateToIso(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

/** Yesterday in LOCAL time — a calendar day back, not 24 hours. */
export function yesterdayString(now: Date): string {
  return localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/** The YYYY-MM-DD a date-mode means, in the device's LOCAL time. */
export function payDateYmd(mode: PayDateMode, pickedDate: string, now: Date): string {
  if (mode === 'today') return localDateString(now);
  if (mode === 'yesterday') return yesterdayString(now);
  return /^\d{4}-\d{2}-\d{2}$/.test(pickedDate) ? pickedDate : localDateString(now);
}

/**
 * The amount a mode records. "full" is the whole balance, "deposit" the deposit
 * still due, "other" the typed amount. Identical to what the old inline form
 * produced: Number(text), floored at 0 (a blank/zero amount saves nothing).
 */
export function payAmountValue(mode: PayMode, amountText: string, balance: number, depositRemaining: number): number {
  if (mode === 'full') return Math.max(0, balance);
  if (mode === 'deposit') return Math.max(0, depositRemaining);
  const n = Number(amountText);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * True when a manual amount is more than the invoice still owes. The sheet uses
 * this to block Save without clamping the typed amount; a zero balance blocks
 * any positive amount, including an invoice that is already overpaid.
 */
export function paymentExceedsBalance(amount: number, balance: number): boolean {
  const remaining = Number.isFinite(balance) ? Math.max(0, balance) : 0;
  return amount > remaining + 1e-9;
}

/** One tap on Save → the exact input `recordPayment` inserts. */
export function buildRecordPayment(opts: {
  mode: PayMode;
  amountText: string;
  balance: number;
  depositRemaining: number;
  method: PaymentMethod;
  dateMode: PayDateMode;
  pickedDate: string;
  now: Date;
}): RecordPaymentInput {
  return {
    amount: payAmountValue(opts.mode, opts.amountText, opts.balance, opts.depositRemaining),
    method: opts.method,
    paidAt: localDateToIso(payDateYmd(opts.dateMode, opts.pickedDate, opts.now)),
  };
}

// ── What failed, in words that name the real cause ─────────────────────
// The sheet used to report a failed save with the same generic line whatever
// happened. A save failure now carries the REAL error (status / code / name /
// message) and is classified by lib/errors, whose five stories are: offline,
// signed out, bad input, not found, our end.

/** The error shape lib/errors classifies. */
export type PaymentSaveError = {
  status?: number;
  code?: string | number | null;
  name?: string;
  message?: string | null;
};

/**
 * What one Save actually did. A failure carries the real error, never a bare
 * boolean: the parent is the only place that has the cause (a missing session,
 * the insert's own error, a queue that could not take the row), and the sheet is
 * the only place that can say it.
 */
export type PaymentSaveResult =
  | { ok: true }
  | { ok: false; error: PaymentSaveError; message?: string };

/** Signed out: a named 401, so the sheet says so instead of blaming the network. */
export const SIGNED_OUT_PAYMENT_ERROR: PaymentSaveError = {
  status: 401, message: 'not authenticated',
};

/** Nothing was written and nothing could be queued (offline, or a full queue). */
export const OFFLINE_PAYMENT_ERROR: PaymentSaveError = {
  name: 'NetworkError', message: 'failed to fetch',
};

/**
 * Which of lib/errors' five stories a failed save is. Pure apart from the
 * caller-supplied `online` (injected so a test can pin the offline story);
 * classifyError itself still prefers a live offline navigator in the browser.
 */
export function classifyPaymentFailure(error: unknown, online = true): ErrorKind {
  if (!online) return 'offline';
  return classifyError(error);
}

/** The sentence to show under the amount: names the cause, never a generic line. */
export function paymentFailureMessage(error: unknown, online = true): string {
  console.error('[record-payment]', error);
  return ERROR_MESSAGE[classifyPaymentFailure(error, online)];
}

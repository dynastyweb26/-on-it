// ═══ Record-payment: UI selection → the recordPayment input ═══
// The invoice-detail bottom sheet owns only PRESENTATION. The mapping from the
// user's taps to the { amount, method, paid_at } the ledger insert needs lives
// here, pure and tested, so the sheet can never drift from the save path.
//
// paid_at is built the same way the page always built it: a bare YYYY-MM-DD is
// a LOCAL calendar date, converted from its parts (never UTC) so a payment
// entered in the evening is stored and shown on the local day.

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

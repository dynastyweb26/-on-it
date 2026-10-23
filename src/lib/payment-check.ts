// ═══ Payment check (Chat card + "Yes, they paid" sheet) ═══
// Pure selection and copy helpers. The DB stays the source of truth: a Yes
// inserts one invoice_payments row and the existing ledger trigger moves the
// invoice to paid. These helpers only decide which unpaid invoices deserve a
// card, in what order, and how the card/sheet reads.
import { roundCurrency } from '@/lib/financials';

export const PAYMENT_CHECK_DAY_MS = 24 * 3600e3;
export const PAYMENT_CHECK_SNOOZE_KEY = 'onit_payment_check_snooze';

/** Card methods. Card is excluded: Stripe marks those paid automatically. */
export type PaymentCheckMethod = 'bank' | 'zelle' | 'cashapp' | 'paypal' | 'venmo' | 'other';

export const PAYMENT_CHECK_METHOD_LABEL: Record<PaymentCheckMethod, string> = {
  bank: 'Bank transfer',
  zelle: 'Zelle',
  cashapp: 'Cash App',
  paypal: 'PayPal',
  venmo: 'Venmo',
  other: 'Other',
};

/** Get Paid order, with Other always last. */
export const PAYMENT_CHECK_METHOD_ORDER: PaymentCheckMethod[] = [
  'bank', 'zelle', 'cashapp', 'paypal', 'venmo', 'other',
];

export interface PaymentCheckInvoice {
  id: string;
  client_name: string | null;
  invoice_number: number;
  total: number | null;
  amount_paid: number | null;
  status: string;
  due_date: string | null;
  sent_at: string | null;
  first_sent_at: string | null;
  created_at?: string | null;
  kind?: string | null;
  deleted_at?: string | null;
}

/** The methods turned on in Settings › Get Paid, in display order. */
export function enabledPaymentCheckMethods(
  profile: {
    bank_account_last4?: string | null;
    bank_transfer_enabled?: boolean | null;
    cashapp_tag?: string | null;
    paypal_me?: string | null;
    venmo_username?: string | null;
  } | null | undefined,
  zelleSet: boolean | null | undefined,
): PaymentCheckMethod[] {
  const out: PaymentCheckMethod[] = [];
  if (profile?.bank_account_last4 && profile.bank_transfer_enabled) out.push('bank');
  // Zelle is encrypted at rest; this boolean comes from GET /api/zelle.
  if (zelleSet === true) out.push('zelle');
  if (profile?.cashapp_tag?.trim()) out.push('cashapp');
  if (profile?.paypal_me?.trim()) out.push('paypal');
  if (profile?.venmo_username?.trim()) out.push('venmo');
  return out;
}

/** "Maria Lopez" → "Maria"; an empty name degrades to "your client". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || 'your client';
}

/** What the invoice still owes, never negative. */
export function remainingBalance(inv: Pick<PaymentCheckInvoice, 'total' | 'amount_paid'>): number {
  return Math.max(0, roundCurrency(Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0)));
}

/** A stable sent timestamp: first_sent_at is write-once; sent_at is the fallback. */
function sentMs(inv: PaymentCheckInvoice): number | null {
  const raw = inv.first_sent_at ?? inv.sent_at;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function ymdToUtcMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Whole calendar days from one YYYY-MM-DD to another (negative when reversed). */
export function daysBetweenYmd(from: string, to: string): number {
  const a = ymdToUtcMs(from);
  const b = ymdToUtcMs(to);
  if (a == null || b == null) return 0;
  return Math.round((b - a) / PAYMENT_CHECK_DAY_MS);
}

export function isPastDue(inv: Pick<PaymentCheckInvoice, 'status' | 'due_date'>, today: string): boolean {
  return inv.status === 'overdue' || (!!inv.due_date && inv.due_date < today);
}

/** "Sent 2 days ago" / "Sent yesterday" / "3 days past due". */
export function paymentCheckStatus(
  inv: PaymentCheckInvoice,
  now: Date,
  today: string,
): { text: string; overdue: boolean } {
  if (isPastDue(inv, today)) {
    const n = inv.due_date ? daysBetweenYmd(inv.due_date, today) : 0;
    return {
      text: n > 0 ? `${n} day${n === 1 ? '' : 's'} past due` : 'Past due',
      overdue: true,
    };
  }
  if (inv.due_date === today) return { text: 'Due today', overdue: false };
  const sent = sentMs(inv);
  if (sent == null) return { text: 'Sent', overdue: false };
  const n = Math.max(0, Math.floor((now.getTime() - sent) / PAYMENT_CHECK_DAY_MS));
  if (n >= 2) return { text: `Sent ${n} days ago`, overdue: false };
  if (n === 1) return { text: 'Sent yesterday', overdue: false };
  return { text: 'Sent today', overdue: false };
}

/**
 * The queue: unpaid invoices sent 24h+ ago or past due, oldest first. Snoozed
 * ids are dropped until their timestamp passes. Fully-paid, draft, void and
 * deleted rows never reach the card.
 */
export function paymentCheckCandidates(
  invoices: PaymentCheckInvoice[],
  opts: { now: Date; today: string; snoozedUntil?: Record<string, number> },
): PaymentCheckInvoice[] {
  const nowMs = opts.now.getTime();
  return invoices
    .filter((inv) => {
      if (inv.kind && inv.kind !== 'invoice') return false;
      if (inv.deleted_at) return false;
      if (inv.status !== 'sent' && inv.status !== 'overdue') return false;
      if (remainingBalance(inv) <= 0) return false;

      const pastDue = isPastDue(inv, opts.today);
      if (!pastDue) {
        const sent = sentMs(inv);
        if (sent == null || nowMs - sent < PAYMENT_CHECK_DAY_MS) return false;
      }

      const snoozed = opts.snoozedUntil?.[inv.id];
      return !(snoozed && snoozed > nowMs);
    })
    .sort((a, b) => {
      const aMs = sentMs(a) ?? (a.created_at ? Date.parse(a.created_at) : 0);
      const bMs = sentMs(b) ?? (b.created_at ? Date.parse(b.created_at) : 0);
      return (Number.isFinite(aMs) ? aMs : 0) - (Number.isFinite(bMs) ? bMs : 0);
    });
}

/** "1 of 3" for the card header. */
export function paymentCheckCount(index: number, total: number): string {
  return `${Math.min(index + 1, total)} of ${total}`;
}

/** "Today" / "Yesterday" / "Tue, Oct 20" for the success line. */
export function paidOnLabel(ymd: string, now: Date): string {
  const today = localYmd(now);
  if (ymd === today) return 'Today';
  const yesterday = localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (ymd === yesterday) return 'Yesterday';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function localYmd(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Drop expired snoozes; keep only well-formed future timestamps. */
export function parsePaymentCheckSnoozes(raw: string | null | undefined, nowMs: number): Record<string, number> {
  if (!raw) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [id, until] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof until === 'number' && Number.isFinite(until) && until > nowMs) out[id] = until;
  }
  return out;
}

/** Snooze one invoice for a day, keeping the rest of the map. */
export function addPaymentCheckSnooze(
  snoozes: Record<string, number>,
  invoiceId: string,
  nowMs: number,
): Record<string, number> {
  return { ...snoozes, [invoiceId]: nowMs + PAYMENT_CHECK_DAY_MS };
}

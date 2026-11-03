// ═══ Income — customer payments and other income, in one list ═══
// Collected is two sources: invoice_payments (a customer paid an invoice) and
// other_income (money that came in without one). The page reads both, newest
// first, and this module is the join so the list, its subtotals and its search
// cannot disagree with Collected.
//
// Nothing here is a total the owner cannot see: every row is confirmed money.
// Unreviewed bank deposits are NOT rows here — they are the pinned Unaccounted
// for income row, and they count in nothing until decided.
import { countsAsIncome, classificationLabel, type OtherIncomeRow } from './other-income';

/** One row on the Income page, whichever table it came from. */
export type IncomeRow = {
  key: string;
  kind: 'payment' | 'other';
  /** Invoice number + client for a payment; the title for other income. */
  title: string;
  /** The second line: "Payment · Zelle" or the classification. */
  detail: string;
  /** yyyy-mm-dd, local. A payment's paid_at is a timestamp; take its day. */
  date: string;
  amountCents: number;
  /** What a tap opens: the invoice, or the other-income form. */
  id: string;
  /** A bank deposit decided as this income: the Bank-verified tag. */
  bankVerified: boolean;
  /** The client, when there is one. */
  client: string | null;
  /** The note the owner typed on an other-income row; null for a payment. */
  note: string | null;
  /** True when a bank deposit decided this row: its amount and delete are the
   *  deposit's, not the sheet's. */
  fromDeposit: boolean;
  /** Soft-deleted rows never reach here; kept for the type's honesty. */
  deletedAt?: string | null;
};

export type PaymentSource = {
  id: string;
  invoice_id: string | null;
  amount: string | number | null;
  paid_at: string | null;
  method: string | null;
  entry_type?: string | null;
  client_name?: string | null;
  invoice_number?: number | null;
  /** Set by the caller when a bank_deposit_links row names this payment. */
  bank_verified?: boolean;
};

export type OtherIncomeSource = {
  id: string;
  amount: string | number | null;
  title: string | null;
  client_name: string | null;
  received_on: string | null;
  note?: string | null;
  deposit_id?: string | null;
  classification?: string | null;
  deleted_at?: string | null;
};

const cents = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

/** The day part of a paid_at timestamp, read as a plain yyyy-mm-dd. */
export function dayOf(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

/** INV-0042 · Cyril. Falls back to "Payment" when the invoice is gone. */
export function paymentTitle(payment: PaymentSource): string {
  const number = payment.invoice_number;
  const invoice = Number.isInteger(number) && (number ?? 0) > 0
    ? `INV-${String(number).padStart(4, '0')}`
    : 'Invoice payment';
  const client = (payment.client_name ?? '').trim();
  return client ? `${invoice} · ${client}` : invoice;
}

/**
 * The two sources as one list.
 * A payment is money received against an invoice; an other_income row is money
 * received without one. An unrecognised classification never counts (fail
 * closed) and is dropped rather than shown as income.
 */
export function mergeIncome(
  payments: readonly PaymentSource[] | null | undefined,
  other: readonly OtherIncomeSource[] | null | undefined,
): IncomeRow[] {
  const rows: IncomeRow[] = [];
  for (const payment of payments ?? []) {
    const amount = cents(payment.amount);
    if (amount <= 0) continue;
    if (payment.entry_type && payment.entry_type !== 'payment') continue;
    const day = dayOf(payment.paid_at);
    if (!day) continue;
    rows.push({
      key: `payment-${payment.id}`,
      kind: 'payment',
      title: paymentTitle(payment),
      detail: `Payment${payment.method ? ` · ${payment.method}` : ''}`,
      date: day,
      amountCents: amount,
      id: payment.invoice_id ?? payment.id,
      bankVerified: Boolean(payment.bank_verified),
      client: payment.client_name ?? null,
      note: null,
      fromDeposit: false,
    });
  }
  for (const row of other ?? []) {
    if (row.deleted_at) continue;
    if (!countsAsIncome(row.classification)) continue;
    const amount = cents(row.amount);
    if (amount <= 0) continue;
    const day = dayOf(row.received_on);
    if (!day) continue;
    const title = (row.title ?? '').trim() || 'Other income';
    rows.push({
      key: `other-${row.id}`,
      kind: 'other',
      title,
      detail: classificationLabel(row.classification),
      date: day,
      amountCents: amount,
      id: row.id,
      bankVerified: Boolean(row.deposit_id),
      client: row.client_name ?? null,
      note: row.note ?? null,
      fromDeposit: Boolean(row.deposit_id),
    });
  }
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => (a.row.date === b.row.date ? a.index - b.index : a.row.date < b.row.date ? 1 : -1))
    .map(({ row }) => row);
}

/** Search: title, detail or client. Case-insensitive, trimmed. */
export function searchIncome(rows: readonly IncomeRow[], query: string): IncomeRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) =>
    [row.title, row.detail, row.client].some((value) => (value ?? '').toLowerCase().includes(q)));
}

export type IncomeGroup = { key: string; label: string; subtotal: number; rows: IncomeRow[] };

const monthKey = (date: string) => date.slice(0, 7);

const monthLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/**
 * Week or Month groups, each with its own subtotal, newest first.
 * Weeks are clamped to their month exactly like Expenses (lib/date-groups), so a
 * week's subtotal always rolls up into one month's total and the two pages'
 * grouping reads the same way.
 */
export function groupIncome(rows: readonly IncomeRow[], grouping: 'week' | 'month'): IncomeGroup[] {
  const groups: IncomeGroup[] = [];
  for (const row of rows) {
    const [y, m, d] = row.date.split('-').map(Number);
    const date = new Date(y, (m ?? 1) - 1, d ?? 1);
    let key: string;
    let label: string;
    if (grouping === 'month') {
      key = monthKey(row.date);
      label = monthLabel(row.date);
    } else {
      // Days since the month's first, floored into 7-day blocks inside it.
      const block = Math.floor((date.getDate() - 1) / 7);
      const start = new Date(y, (m ?? 1) - 1, block * 7 + 1);
      const endDay = Math.min(block * 7 + 7, new Date(y, m ?? 1, 0).getDate());
      const end = new Date(y, (m ?? 1) - 1, endDay);
      key = `${monthKey(row.date)}-w${block}`;
      label = start.getMonth() === end.getMonth()
        ? `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}–${end.getDate()}`
        : `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} – ${end.toLocaleDateString('en-US', { month: 'short' })} ${end.getDate()}`;
    }
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(row);
      last.subtotal += row.amountCents;
    } else {
      groups.push({ key, label, subtotal: row.amountCents, rows: [row] });
    }
  }
  return groups;
}

/** The whole list's total, in cents. Customer payments plus other income. */
export const incomeTotal = (rows: readonly IncomeRow[]): number =>
  rows.reduce((sum, row) => sum + row.amountCents, 0);

/** "+$1,200.00" — income is always shown with its direction. */
export function incomeMoney(cents: number): string {
  const value = Number.isFinite(cents) ? cents / 100 : 0;
  return `+${value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
}

/** The empty-state line differs once something was deleted: caught up vs none. */
export const INCOME_EMPTY = {
  none: {
    title: 'No income yet.',
    message: 'Payments recorded against an invoice, and other money you add, land here.',
  },
  caughtUp: {
    title: 'All caught up.',
    message: 'Every payment and every deposit has been decided.',
  },
};

/** The pinned row's copy (CHANGES.md · A): red marks undecided money, not debt. */
export const UNACCOUNTED_INCOME_LABEL = 'Unaccounted for income';
export const UNACCOUNTED_INCOME_NOTE = 'not in your totals';

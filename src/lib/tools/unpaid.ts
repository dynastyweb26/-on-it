// ═══ AI Smart · unpaid invoices (read-only tool) ═══
//
// One question the owner asks in words — "who hasn't paid me?" — answered from
// the invoices table under the caller's OWN session. RLS is the boundary: this
// takes a user-scoped client, never the service role, and always scopes the
// query by user_id as well.
//
// Read-only by construction. The only statement here is a select. Nothing in
// this file writes, finalizes, renders a PDF or moves a status.
//
// Money is server-owned, exactly as in /api/parse: the model never states a
// figure, so every amount is composed here with money() from lib/financials and
// the route drops any sentence the model writes that carries a "$" amount.
//
// What counts as unpaid (Slice 0 call): kind 'invoice', not soft-deleted, status
// 'sent' or 'overdue', balance > 0. Partials are included, and a deposit already
// recorded counts toward amount_paid because that column is the ledger total the
// invoice_payments trigger maintains (migration 20260918000000).
import type { SupabaseClient } from '@supabase/supabase-js';
import { money, roundCurrency } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';

/** Rows one answer may carry. */
export const UNPAID_ROW_CAP = 20;
/** Rows the read will look at: an answer is a summary, not an export. */
export const UNPAID_SCAN_LIMIT = 500;

export type UnpaidInvoiceRow = {
  id: string;
  invoice_number: number | null;
  client_name: string | null;
  total: number | string | null;
  amount_paid: number | string | null;
  due_date: string | null;
  status: string | null;
};

export type UnpaidInvoice = {
  id: string;
  /** The app's own document number, e.g. INV-0042; "Invoice" when unnumbered. */
  number: string;
  client: string;
  balance: number;
  /** Server-formatted money, so no caller ever prints a raw number. */
  balanceText: string;
  dueDate: string | null;
  status: 'sent' | 'overdue';
};

export type UnpaidSummary = {
  rows: UnpaidInvoice[];
  /** Every unpaid invoice, not just the rows returned. */
  totalCount: number;
  totalBalance: number;
  totalBalanceText: string;
  /** The one money line the server speaks; the model may not write money. */
  sentence: string;
};

export type UnpaidResult =
  | ({ ok: true } & UnpaidSummary)
  | { ok: false; error: string };

const num = (value: number | string | null | undefined): number => {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** What is still owed on one invoice: total minus the recorded ledger payments. */
export function balanceOf(row: UnpaidInvoiceRow): number {
  return roundCurrency(num(row.total) - num(row.amount_paid));
}

function statusOf(row: UnpaidInvoiceRow): 'sent' | 'overdue' | null {
  return row.status === 'sent' || row.status === 'overdue' ? row.status : null;
}

/** The one definition of unpaid: sent or overdue, and something still owed. */
export function isUnpaidInvoice(row: UnpaidInvoiceRow): boolean {
  if (!statusOf(row)) return false;
  return balanceOf(row) > 0;
}

/** The spoken summary. No amount is ever derived by the model. */
export function unpaidSentence(count: number, balance: number): string {
  if (count <= 0) return 'Nothing is outstanding: every invoice you have sent is paid.';
  const amount = money(balance);
  return count === 1
    ? `1 invoice is still open, ${amount} outstanding.`
    : `${count} invoices are still open, ${amount} outstanding.`;
}

export type UnpaidOptions = {
  /** Only invoices owing at least this many dollars. */
  minBalance?: number;
  /** How many rows to return, 1..UNPAID_ROW_CAP. */
  cap?: number;
};

/**
 * Pure: rows in, summary out. Filters to real unpaid invoices, sorts the ones
 * that need chasing first (earliest due date, an invoice with no due date last,
 * then the biggest balance), caps the rows, and totals every unpaid invoice.
 */
export function summarizeUnpaid(
  rows: readonly UnpaidInvoiceRow[],
  opts: UnpaidOptions = {}
): UnpaidSummary {
  const minBalance =
    typeof opts.minBalance === 'number' && Number.isFinite(opts.minBalance)
      ? Math.max(0, opts.minBalance)
      : 0;
  const cap =
    typeof opts.cap === 'number' && Number.isFinite(opts.cap)
      ? Math.min(UNPAID_ROW_CAP, Math.max(1, Math.floor(opts.cap)))
      : UNPAID_ROW_CAP;

  const unpaid = (rows ?? [])
    .filter(isUnpaidInvoice)
    .map((row) => ({ row, balance: balanceOf(row) }))
    .filter(({ balance }) => balance > 0 && balance >= minBalance)
    .sort((a, b) => {
      if (a.row.due_date && b.row.due_date && a.row.due_date !== b.row.due_date) {
        return a.row.due_date < b.row.due_date ? -1 : 1;
      }
      if (a.row.due_date && !b.row.due_date) return -1;
      if (!a.row.due_date && b.row.due_date) return 1;
      return b.balance - a.balance;
    });

  const totalCount = unpaid.length;
  const totalBalance = roundCurrency(unpaid.reduce((sum, item) => sum + item.balance, 0));

  const outRows: UnpaidInvoice[] = unpaid.slice(0, cap).map(({ row, balance }) => ({
    id: row.id,
    number: row.invoice_number == null
      ? 'Invoice'
      : formatDocNumber('invoice', row.invoice_number),
    client: row.client_name?.trim() || 'Unnamed client',
    balance,
    balanceText: money(balance),
    dueDate: row.due_date,
    status: statusOf(row) ?? 'sent',
  }));

  return {
    rows: outRows,
    totalCount,
    totalBalance,
    totalBalanceText: money(totalBalance),
    sentence: unpaidSentence(totalCount, totalBalance),
  };
}

/**
 * The read. Runs under the caller's session, so RLS decides what exists; the
 * explicit user_id filter is belt and braces, never a privilege escalation.
 */
export async function readUnpaidInvoices(
  supabase: SupabaseClient,
  userId: string,
  opts: UnpaidOptions = {}
): Promise<UnpaidResult> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, total, amount_paid, due_date, status')
    .eq('user_id', userId)
    .eq('kind', 'invoice')
    .is('deleted_at', null)
    .in('status', ['sent', 'overdue'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(UNPAID_SCAN_LIMIT);

  if (error) return { ok: false, error: error.message };
  return { ok: true, ...summarizeUnpaid((data ?? []) as UnpaidInvoiceRow[], opts) };
}

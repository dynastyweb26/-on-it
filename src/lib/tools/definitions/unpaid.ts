// ═══ Tool · unpaid_invoices (read) ═══
//
// "Who hasn't paid me?" answered from the caller's own rows. The definition is
// data plus a handler over ToolDb; the query itself lives in ../unpaid so the
// calculation stays unit-tested on its own.
//
// Read-only: the handler performs one select and returns. It cannot write, send,
// finalize, render a PDF or move a status, and its type says so.
import { z } from 'zod';
import { defineTool } from '../contract';
import { readUnpaidInvoices, UNPAID_ROW_CAP, type UnpaidSummary } from '../unpaid';
import { money } from '@/lib/financials';

export const UNPAID_TOOL_NAME = 'unpaid_invoices';

/** What the model may pass. Unknown keys are refused, not forwarded. */
export const UnpaidInput = z
  .object({
    min_balance: z.number().finite().min(0).max(1_000_000).optional(),
    limit: z.number().int().min(1).max(UNPAID_ROW_CAP).optional(),
  })
  .strict();

/** One `list.ranked` row. Every amount is a finished, server-composed string. */
export const RankedRow = z.object({
  id: z.string(),
  name: z.string().min(1),
  secondary: z.string().min(1),
  /** Owed money, so neutral: no plus, no minus. It has not come in yet. */
  amount: z.string().min(1),
  tone: z.enum(['in', 'out', 'neutral']),
  chip: z
    .object({
      tone: z.enum(['late', 'paid', 'due']),
      label: z.string().min(1),
    })
    .optional(),
});

/** The one total line under the rows, composed here and never by a component. */
export const RankedTotal = z.object({
  label: z.string().min(1),
  amount: z.string().min(1),
  tone: z.enum(['in', 'out', 'neutral']),
});

/** What the app receives: the card's data, the model's numbers, and the fallback. */
export const UnpaidOutput = z.object({
  eyebrow: z.string().min(1),
  rows: z.array(RankedRow),
  totalCount: z.number().int().nonnegative(),
  total: RankedTotal,
  /** Numeric total for the model's reasoning only; the card prints `total`. */
  totalBalance: z.number().finite(),
  totalBalanceText: z.string().min(1),
  sentence: z.string().min(1),
});

/** Props the `list.ranked` component is allowed to be handed. */
export const UnpaidCardProps = z.object({
  eyebrow: z.string().min(1),
  rows: z.array(RankedRow),
  totalCount: z.number().int().nonnegative(),
  total: RankedTotal,
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date from either driver: Postgres/PGlite returns Date, Supabase returns text. */
export function isoDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** "2026-10-01" → "Oct 1". Data copy only; no money and no invented words. */
export function shortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day || month < 1 || month > 12) return iso;
  return `${MONTHS[month - 1]} ${day}`;
}

/** Whole days between two ISO dates, UTC so a timezone cannot move a day. */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * The `list.ranked` data for one unpaid summary. Amounts are finished strings;
 * the chip says how late a row is (the design's "34d late" pattern) and the
 * total is the server's count and money, never a component's arithmetic.
 */
export function unpaidCard(summary: UnpaidSummary, todayISO: string) {
  const rows = summary.rows.map((row) => {
    const due = isoDate(row.dueDate);
    const late = due ? daysBetween(due, todayISO) : 0;
    return {
      id: row.id,
      name: row.client,
      secondary: due ? `${row.number} · Due ${shortDate(due)}` : row.number,
      amount: row.balanceText,
      tone: 'neutral' as const,
      ...(due
        ? {
          chip: late > 0
            ? { tone: 'late' as const, label: `${late}d late` }
            : { tone: 'due' as const, label: `Due ${shortDate(due)}` },
        }
        : {}),
    };
  });

  const count = summary.totalCount;
  return {
    eyebrow: 'Who owes you',
    rows,
    totalCount: count,
    total: {
      label: `Owed to you · ${count} ${count === 1 ? 'client' : 'clients'}`,
      amount: money(summary.totalBalance),
      tone: 'neutral' as const,
    },
    totalBalance: summary.totalBalance,
    totalBalanceText: summary.totalBalanceText,
    sentence: summary.sentence,
  };
}
export const unpaidTool = defineTool({
  name: UNPAID_TOOL_NAME,
  description:
    'List this owner\'s sent invoices that are still unpaid, oldest due date first, ' +
    'with the number still owed on each. Read-only: it never changes, sends or saves ' +
    'anything. Amounts come back for your reasoning only — the app prints every figure.',
  input: UnpaidInput,
  output: UnpaidOutput,
  type: 'read',
  risk: 'low',
      defaultTemplate: { id: 'list.ranked', props: UnpaidCardProps },
    // "Show all N" opens Invoices, which already has the unpaid filter.
    destination: { screen: 'Invoices · unpaid', path: '/invoices?filter=unpaid' },
  fallback: (result) => result.sentence,
  modelPayload: (result) => ({
    total_count: result.totalCount,
    total_balance: result.totalBalance,
    total_balance_text: result.totalBalanceText,
    invoices: result.rows.map((row) => ({
      name: row.name,
      detail: row.secondary,
      balance_text: row.amount,
    })),
    note: 'Amounts are for your reasoning only. Never repeat a figure; the app prints money.',
  }),
  handler: async (ctx, args) => {
    const found = await readUnpaidInvoices(ctx.db, ctx.userId, {
      minBalance: args.min_balance,
      cap: args.limit,
    });
    if (!found.ok) throw new Error(found.error);
    return unpaidCard(found, new Date().toISOString().slice(0, 10));
  },
  fixture: {
    args: {},
    result: {
      eyebrow: 'Who owes you',
      rows: [{
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Maria Santos',
        secondary: 'INV-0042 · Due Oct 1',
        amount: '$120.00',
        tone: 'neutral',
        chip: { tone: 'late', label: '42d late' },
      }],
      totalCount: 1,
      total: {
        label: 'Owed to you · 1 client',
        amount: '$120.00',
        tone: 'neutral',
      },
      totalBalance: 120,
      totalBalanceText: '$120.00',
      sentence: '1 invoice is still open, $120.00 outstanding.',
    },
  },
});

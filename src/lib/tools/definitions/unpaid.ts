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
import { readUnpaidInvoices, UNPAID_ROW_CAP } from '../unpaid';

export const UNPAID_TOOL_NAME = 'unpaid_invoices';

/** What the model may pass. Unknown keys are refused, not forwarded. */
export const UnpaidInput = z
  .object({
    min_balance: z.number().finite().min(0).max(1_000_000).optional(),
    limit: z.number().int().min(1).max(UNPAID_ROW_CAP).optional(),
  })
  .strict();

export const UnpaidRow = z.object({
  id: z.string(),
  number: z.string(),
  client: z.string(),
  balance: z.number().finite(),
  balanceText: z.string().min(1),
  dueDate: z.string().nullable(),
  status: z.enum(['sent', 'overdue']),
});

/** What the app receives, and what the chat card renders. */
export const UnpaidOutput = z.object({
  rows: z.array(UnpaidRow),
  totalCount: z.number().int().nonnegative(),
  totalBalance: z.number().finite(),
  totalBalanceText: z.string().min(1),
  sentence: z.string().min(1),
});

/** Props the unpaid chat card is allowed to be handed. */
export const UnpaidCardProps = z.object({
  totalCount: z.number().int().nonnegative(),
  totalBalanceText: z.string().min(1),
  rows: z.array(UnpaidRow),
});

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
  defaultTemplate: { id: 'unpaid_list', props: UnpaidCardProps },
  modelPayload: (result) => ({
    total_count: result.totalCount,
    total_balance: result.totalBalance,
    total_balance_text: result.totalBalanceText,
    invoices: result.rows.map((row) => ({
      number: row.number,
      client: row.client,
      balance_text: row.balanceText,
      due_date: row.dueDate,
      status: row.status,
    })),
    note: 'Amounts are for your reasoning only. Never repeat a figure; the app prints money.',
  }),
  handler: async (ctx, args) => {
    const found = await readUnpaidInvoices(ctx.db, ctx.userId, {
      minBalance: args.min_balance,
      cap: args.limit,
    });
    if (!found.ok) throw new Error(found.error);
    return {
      rows: found.rows,
      totalCount: found.totalCount,
      totalBalance: found.totalBalance,
      totalBalanceText: found.totalBalanceText,
      sentence: found.sentence,
    };
  },
  fixture: {
    args: {},
    result: {
      rows: [{
        id: '11111111-1111-1111-1111-111111111111',
        number: 'INV-0042',
        client: 'Maria Santos',
        balance: 120,
        balanceText: '$120.00',
        dueDate: '2026-10-01',
        status: 'sent',
      }],
      totalCount: 1,
      totalBalance: 120,
      totalBalanceText: '$120.00',
      sentence: '1 invoice is still open, $120.00 outstanding.',
    },
  },
});

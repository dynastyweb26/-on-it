// ═══ Tool · list_estimates (read) ═══
//
// "What did I quote Mike for the door?" Estimates are invoices with
// kind='quote', and the word is always "estimate", never "quote" (docNoun).
// Same forgiving filters and 25-row cap as list_invoices; money strings are
// composed here, once.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps } from '@/lib/templates/props';
import {
  READ_CAP,
  InvoiceRow,
  asInvoiceRow,
  docLabel,
  forgivingFilters,
  matchOf,
  moneyText,
  newestFirst,
  num,
  rowMatches,
} from '../read';

export const LIST_ESTIMATES = 'list_estimates';

export const ListEstimatesInput = z
  .object({
    status: z.array(z.string()).max(5).optional(),
    client: z.string().max(120).optional(),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
    min_amount: z.number().finite().min(0).max(10_000_000).optional(),
    max_amount: z.number().finite().min(0).max(10_000_000).optional(),
    limit: z.number().int().min(1).max(READ_CAP).optional(),
  })
  .strict();

const Document = z.object({
  id: z.string(),
  number: z.string(),
  noun: z.literal('estimate'),
  clientName: z.string(),
  status: z.string(),
  total: z.string(),
  dueDate: z.string().nullable(),
});

export const ListEstimatesOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  totalCount: z.number().int().nonnegative(),
  rows: RankedListProps.shape.rows,
  total: RankedListProps.shape.total,
  documents: z.array(Document),
});

export const listEstimatesTool = defineTool({
  name: LIST_ESTIMATES,
  description:
    'Read-only list of the user’s own estimates (called "estimates", numbered E-0007), newest first, with optional status, client name, date and amount filters. Returns at most 25 plus the full count; unknown filter values are reported in `ignored`, never an error. Use this when the user asks what they estimated for a job.',
  input: ListEstimatesInput,
  output: ListEstimatesOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  destination: { screen: 'Invoices', path: '/invoices' },
  handler: async (ctx, args) => {
    const { filters, ignored } = forgivingFilters(args);
    const { data, error } = await ctx.db.select<InvoiceRow>('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId, kind: 'quote' },
      is: { deleted_at: null },
      order: { column: 'created_at', ascending: false },
    });
    if (error) throw new Error(error.message);

    const matched = (data ?? [])
      .map(asInvoiceRow)
      .filter((r) => rowMatches(r, filters))
      .sort(newestFirst);
    const shown = matched.slice(0, args.limit ?? READ_CAP);
    const total = matched.reduce((sum, r) => sum + num(r.total), 0);
    const count = matched.length;

    return {
      match: matchOf(count),
      count,
      ignored,
      eyebrow: 'Your estimates',
      title: count ? 'Newest first.' : '',
      totalCount: count,
      rows: shown.map((r) => ({
        name: r.client_name,
        secondary: docLabel(r),
        amount: moneyText(num(r.total)),
        chip:
          r.status === 'paid'
            ? { tone: 'paid' as const, label: 'Accepted' }
            : r.status === 'overdue'
              ? { tone: 'late' as const, label: 'Expired' }
              : undefined,
      })),
      total: {
        label: `${count} ${count === 1 ? 'estimate' : 'estimates'}`,
        amount: moneyText(total),
      },
      documents: shown.map((r) => ({
        id: r.id,
        number: docLabel(r),
        noun: 'estimate' as const,
        clientName: r.client_name,
        status: r.status,
        total: moneyText(num(r.total)),
        dueDate: r.due_date ?? null,
      })),
    };
  },
  fallback: (result) =>
    result.count === 0
      ? 'No estimates match that.'
      : `${result.count} ${result.count === 1 ? 'estimate' : 'estimates'}, ${result.total.amount} in total.`,
  fixture: {
    args: {},
    result: {
      match: 'one',
      count: 1,
      ignored: [],
      eyebrow: 'Your estimates',
      title: 'Newest first.',
      totalCount: 1,
      rows: [{ name: 'Mike Alvarez', secondary: 'E-0003', amount: '$2,400.00' }],
      total: { label: '1 estimate', amount: '$2,400.00' },
      documents: [
        {
          id: 'est-3',
          number: 'E-0003',
          noun: 'estimate',
          clientName: 'Mike Alvarez',
          status: 'sent',
          total: '$2,400.00',
          dueDate: '2026-11-20',
        },
      ],
    },
  },
});

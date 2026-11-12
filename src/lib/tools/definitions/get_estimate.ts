// ═══ Tool · get_estimate (read) ═══
//
// One estimate by number or id. Estimates are kind='quote' rows, the word is
// "estimate" and the number reads E-0007; the facts sit in typed fields beside
// a nav.link to the record.
import { z } from 'zod';
import { defineTool } from '../contract';
import { NavLinkProps } from '@/lib/templates/props';
import { asInvoiceRow, docLabel, matchOf, moneyText, num, type InvoiceRow } from '../read';

export const GET_ESTIMATE = 'get_estimate';

export const GetEstimateInput = z
  .object({
    number: z.number().int().min(1).max(1_000_000).optional(),
    id: z.string().max(64).optional(),
  })
  .strict()
  .refine((v) => v.number !== undefined || (v.id ?? '').trim() !== '', {
    message: 'give the estimate number or its id',
  });

const Fact = z.object({
  id: z.string(),
  number: z.string(),
  noun: z.literal('estimate'),
  clientName: z.string(),
  status: z.string(),
  total: z.string(),
  dueDate: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
});

export const GetEstimateOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  items: z.array(z.object({ icon: z.string(), title: z.string(), line: z.string() })),
  estimate: Fact.nullable(),
});

export const getEstimateTool = defineTool({
  name: GET_ESTIMATE,
  description:
    'Read-only lookup of ONE estimate by its number (E-0007) or id, returning its status, total, line count, expiry date and a link to the record. Use list_estimates when the user has not named a single estimate.',
  input: GetEstimateInput,
  output: GetEstimateOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'nav.link', props: NavLinkProps },
  handler: async (ctx, args) => {
    const { data, error } = await ctx.db.select<InvoiceRow>('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId, kind: 'quote' },
      is: { deleted_at: null },
    });
    if (error) throw new Error(error.message);

    const pairs = (data ?? []).map((raw) => ({ raw: raw as Record<string, unknown>, row: asInvoiceRow(raw) }));
    const wanted = args.number !== undefined ? pairs.filter((p) => p.row.invoice_number === args.number) : [];
    const found = args.id ? pairs.filter((p) => p.row.id === args.id) : wanted;
    const pair = found[0];
    const row = pair?.row;

    if (!row) {
      return { match: matchOf(found.length), count: found.length, ignored: [], items: [], estimate: null };
    }
    const total = moneyText(num(row.total));
    return {
      match: matchOf(found.length),
      count: found.length,
      ignored: [],
      items: [
        {
          icon: 'description',
          title: `${docLabel(row)} · ${row.client_name}`,
          line: `${row.status} · ${total}`,
        },
      ],
      estimate: {
        id: row.id,
        number: docLabel(row),
        noun: 'estimate' as const,
        clientName: row.client_name,
        status: row.status,
        total,
        dueDate: row.due_date ?? null,
        lineCount: Array.isArray(pair?.raw.line_items) ? (pair.raw.line_items as unknown[]).length : 0,
      },
    };
  },
  fallback: (result) =>
    result.estimate
      ? `${result.estimate.number} for ${result.estimate.clientName}: ${result.estimate.status}, ${result.estimate.total}.`
      : 'No estimate matches that number.',
  fixture: {
    args: { number: 3 },
    result: {
      match: 'one',
      count: 1,
      ignored: [],
      items: [{ icon: 'description', title: 'E-0003 · Mike Alvarez', line: 'sent · $2,400.00' }],
      estimate: {
        id: 'est-3',
        number: 'E-0003',
        noun: 'estimate',
        clientName: 'Mike Alvarez',
        status: 'sent',
        total: '$2,400.00',
        dueDate: '2026-11-20',
        lineCount: 2,
      },
    },
  },
});

// ═══ Tool · get_invoice (read) ═══
//
// One invoice by number or id, with the facts the chat cannot guess: status,
// total, what is left, the due date and where it lives. nav.link points at the
// record; the facts live in typed fields beside it.
import { z } from 'zod';
import { defineTool } from '../contract';
import { NavLinkProps } from '@/lib/templates/props';
import { asInvoiceRow, docLabel, matchOf, moneyText, num, type InvoiceRow } from '../read';

export const GET_INVOICE = 'get_invoice';

export const GetInvoiceInput = z
  .object({
    number: z.number().int().min(1).max(1_000_000).optional(),
    id: z.string().max(64).optional(),
  })
  .strict()
  .refine((v) => v.number !== undefined || (v.id ?? '').trim() !== '', {
    message: 'give the invoice number or its id',
  });

const Fact = z.object({
  id: z.string(),
  number: z.string(),
  clientName: z.string(),
  status: z.string(),
  total: z.string(),
  balance: z.string(),
  dueDate: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
});

export const GetInvoiceOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  items: z.array(z.object({ icon: z.string(), title: z.string(), line: z.string() })),
  invoice: Fact.nullable(),
});

const fixtureInvoice = {
  id: 'inv-74',
  number: 'INV-0074',
  clientName: 'Chenyi',
  status: 'overdue',
  total: '$8,100.00',
  balance: '$8,100.00',
  dueDate: '2026-10-08',
  lineCount: 3,
};

export const getInvoiceTool = defineTool({
  name: GET_INVOICE,
  description:
    'Read-only lookup of ONE invoice by its number or id, returning its client, status, total, outstanding balance, due date, how many line items it has and a link to the record. Use list_invoices when the user has not named a single invoice.',
  input: GetInvoiceInput,
  output: GetInvoiceOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'nav.link', props: NavLinkProps },
  handler: async (ctx, args) => {
    const { data, error } = await ctx.db.select<InvoiceRow>('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId, kind: 'invoice' },
      is: { deleted_at: null },
    });
    if (error) throw new Error(error.message);

    const pairs = (data ?? []).map((raw) => ({ raw: raw as Record<string, unknown>, row: asInvoiceRow(raw) }));
    const wanted = args.number !== undefined ? pairs.filter((p) => p.row.invoice_number === args.number) : [];
    const found = args.id ? pairs.filter((p) => p.row.id === args.id) : wanted;
    const pair = found[0];
    const row = pair?.row;

    if (!row) {
      return { match: matchOf(found.length), count: found.length, ignored: [], items: [], invoice: null };
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
      invoice: {
        id: row.id,
        number: docLabel(row),
        clientName: row.client_name,
        status: row.status,
        total,
        balance: moneyText(Math.max(0, num(row.total) - num(row.amount_paid))),
        dueDate: row.due_date ?? null,
        lineCount: Array.isArray(pair?.raw.line_items) ? (pair.raw.line_items as unknown[]).length : 0,
      },
    };
  },
  fallback: (result) =>
    result.invoice
      ? `${result.invoice.number} for ${result.invoice.clientName}: ${result.invoice.status}, ${result.invoice.balance} left.`
      : 'No invoice matches that number.',
  fixture: { args: { number: 74 }, result: { match: 'one', count: 1, ignored: [], items: [{ icon: 'description', title: 'INV-0074 · Chenyi', line: 'overdue · $8,100.00' }], invoice: fixtureInvoice } },
});

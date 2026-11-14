// ═══ Tool · list_invoices (read) ═══
//
// "Show me my invoices" with forgiving filters. Invoices only (kind='invoice'):
// estimates are the other tool. At most 25 rows plus the full count, and every
// result says whether it found none, one or many so the model never has to
// guess. Money is composed here, once, as finished strings.
import { z } from 'zod';
import { defineTool } from '../contract';
import { NavLinkProps, RankedListProps } from '@/lib/templates/props';
import {
  READ_CAP,
  InvoiceRow,
  asInvoiceRow,
  docLabel,
  forgivingFilters,
  joinNames,
  matchOf,
  moneyText,
  newestFirst,
  normName,
  num,
  resolveClient,
  rowMatches,
} from '../read';

export const LIST_INVOICES = 'list_invoices';

export const ListInvoicesInput = z
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
  noun: z.literal('invoice'),
  clientName: z.string(),
  status: z.string(),
  total: z.string(),
  balance: z.string(),
  dueDate: z.string().nullable(),
});

export const ListInvoicesOutput = z.object({
  /**
   * ambiguous: the name matched more than one client, so there are no rows and
   * no figures at all. none: nobody on file is called that.
   */
  match: z.enum(['none', 'one', 'many', 'ambiguous']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  totalCount: z.number().int().nonnegative(),
  rows: RankedListProps.shape.rows,
  /** Null when there is no answer to total: several clients, or none on file. */
  total: RankedListProps.shape.total.nullable(),
  documents: z.array(Document),
  /** The client names to ask about when `match` is ambiguous, sorted. */
  clientChoices: z.array(z.string()),
  /** The name the user said, as it reached the tool. */
  clientQuery: z.string(),
  /** A from/to that was given but is not a date: the list is empty, not wide. */
  dateProblem: z.string().optional(),
});

const row = (i: number, over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: `inv-${i}`,
  kind: 'invoice',
  invoice_number: i,
  client_name: 'Maria Santos',
  status: 'sent',
  total: 120,
  amount_paid: 0,
  due_date: '2026-10-01',
  created_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
  ...over,
});

export const listInvoicesTool = defineTool({
  name: LIST_INVOICES,
  description:
    'Read-only list of the user’s own invoices, newest first, with each invoice’s client, status, total, outstanding balance and due date, and optional status, client name, date and amount filters. Statuses are draft, sent, paid, overdue and void. This answers "which invoices are paid" and "how many invoices have I sent"; the outstanding total across clients belongs to unpaid_invoices. Returns at most 25 documents plus the full count; unknown filter values are reported in `ignored`, never an error.',
  input: ListInvoicesInput,
  output: ListInvoicesOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  // Declared so templateFor may return null: a name that is several clients is
  // a sentence to read, never a card of somebody else's money.
  alternateTemplate: { id: 'nav.link', props: NavLinkProps },
  templateFor: (result) =>
    result.match === 'ambiguous' || (result.clientQuery !== '' && result.match === 'none')
      ? null
      : 'list.ranked',
  destination: { screen: 'Invoices', path: '/invoices' },
  handler: async (ctx, args) => {
    const { filters, ignored, badDates } = forgivingFilters(args);
    const clientQuery = filters.client ?? '';
    if (badDates.length) {
      // A date we cannot read must never widen the answer to all time.
      return {
        match: 'none' as const,
        count: 0,
        ignored,
        eyebrow: 'Your invoices',
        title: '',
        totalCount: 0,
        rows: [],
        total: null,
        documents: [],
        clientChoices: [],
        clientQuery,
        dateProblem: badDates[0],
      };
    }

    // The tool, not the model, decides who the name is.
    const resolved = clientQuery ? await resolveClient(ctx, clientQuery) : null;
    if (resolved?.kind === 'many') {
      return {
        match: 'ambiguous' as const,
        count: 0,
        ignored,
        eyebrow: 'Your invoices',
        title: 'Which one?',
        totalCount: 0,
        rows: [],
        total: null,
        documents: [],
        clientChoices: resolved.names,
        clientQuery,
      };
    }
    if (resolved?.kind === 'none') {
      return {
        match: 'none' as const,
        count: 0,
        ignored,
        eyebrow: 'Your invoices',
        title: '',
        totalCount: 0,
        rows: [],
        total: null,
        documents: [],
        clientChoices: [],
        clientQuery,
      };
    }
    const resolvedName = resolved?.kind === 'one' ? resolved.name : null;
    const who = resolvedName ? normName(resolvedName) : null;
    const { data, error } = await ctx.db.select<InvoiceRow>('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId, kind: 'invoice' },
      is: { deleted_at: null },
      order: { column: 'created_at', ascending: false },
    });
    if (error) throw new Error(error.message);

    // One resolved client is filtered by exact equality, never by fuzzy match:
    // "Ruth" is Ruth Lawrence's rows only, not every Ruth's.
    const matched = (data ?? [])
      .map(asInvoiceRow)
      .filter((r) => rowMatches(r, { ...filters, client: undefined }))
      .filter((r) => who === null || normName(r.client_name) === who)
      .sort(newestFirst);
    const shown = matched.slice(0, args.limit ?? READ_CAP);
    const total = matched.reduce((sum, r) => sum + num(r.total), 0);
    const count = matched.length;

    return {
      match: matchOf(count),
      count,
      ignored,
      eyebrow: 'Your invoices',
      title: count ? 'Newest first.' : '',
      totalCount: count,
      rows: shown.map((r) => ({
        name: r.client_name,
        secondary: docLabel(r),
        amount: moneyText(num(r.total)),
        chip:
          r.status === 'overdue'
            ? { tone: 'late' as const, label: 'Overdue' }
            : r.status === 'paid'
              ? { tone: 'paid' as const, label: 'Paid' }
              : undefined,
      })),
      total: { label: `${count} ${count === 1 ? 'invoice' : 'invoices'}`, amount: moneyText(total) },
      clientChoices: [],
      clientQuery,
      documents: shown.map((r) => ({
        id: r.id,
        number: docLabel(r),
        noun: 'invoice' as const,
        clientName: r.client_name,
        status: r.status,
        total: moneyText(num(r.total)),
        balance: moneyText(Math.max(0, num(r.total) - num(r.amount_paid))),
        dueDate: r.due_date ?? null,
      })),
    };
  },
  fallback: (result) =>
    result.match === 'ambiguous'
      ? `${result.clientChoices.length} clients match ${result.clientQuery}: ${joinNames(result.clientChoices)}. Ask again with the full name.`
      : result.clientQuery && result.match === 'none'
        ? `No client named ${result.clientQuery} on file.`
        : result.dateProblem
          ? `No rows: I did not understand the date "${result.dateProblem}".`
          : result.count === 0
            ? 'No invoices match that.'
            : `${result.count} ${result.count === 1 ? 'invoice' : 'invoices'}, ${result.total?.amount ?? ''} in total.`,
  fixture: {
    args: {},
    result: {
      match: 'many',
      count: 2,
      ignored: [],
      eyebrow: 'Your invoices',
      title: 'Newest first.',
      totalCount: 2,
      rows: [
        { name: 'Maria Santos', secondary: 'INV-0002', amount: '$80.00' },
        { name: 'Ruth Lawrence', secondary: 'INV-0001', amount: '$120.00' },
      ],
      total: { label: '2 invoices', amount: '$200.00' },
      clientChoices: [],
      clientQuery: '',
      documents: [
        {
          id: 'inv-2',
          number: 'INV-0002',
          noun: 'invoice',
          clientName: 'Maria Santos',
          status: 'sent',
          total: '$80.00',
          balance: '$80.00',
          dueDate: '2026-10-01',
        },
        {
          id: 'inv-1',
          number: 'INV-0001',
          noun: 'invoice',
          clientName: 'Ruth Lawrence',
          status: 'overdue',
          total: '$120.00',
          balance: '$120.00',
          dueDate: '2026-09-01',
        },
      ],
    },
  },
});

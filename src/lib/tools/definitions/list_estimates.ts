// ═══ Tool · list_estimates (read) ═══
//
// "What did I quote Mike for the door?" Estimates are invoices with
// kind='quote', and the word is always "estimate", never "quote" (docNoun).
// Same forgiving filters and 25-row cap as list_invoices; money strings are
// composed here, once.
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
  /** ambiguous: the name matched several clients; none: nobody is called that. */
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

export const listEstimatesTool = defineTool({
  name: LIST_ESTIMATES,
  description:
    'Read-only list of the user’s own estimates (called "estimates", numbered E-0007), newest first, with each estimate’s client, status, total and expiry date, and optional status, client name, date and amount filters. An estimate reads Accepted once paid and Expired once overdue, so this answers "which estimates were accepted", "which expire soon" and the total value of estimates. Returns at most 25 plus the full count; unknown filter values are reported in `ignored`, never an error. Use this when the user asks what they estimated for a job.',
  input: ListEstimatesInput,
  output: ListEstimatesOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  // Declared so templateFor may return null: several clients is a sentence to
  // read, never a card of somebody else's money.
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
        eyebrow: 'Your estimates',
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
        eyebrow: 'Your estimates',
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
        eyebrow: 'Your estimates',
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
      eq: { user_id: ctx.userId, kind: 'quote' },
      is: { deleted_at: null },
      order: { column: 'created_at', ascending: false },
    });
    if (error) throw new Error(error.message);

    // One resolved client is filtered by exact equality, never by fuzzy match.
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
      clientChoices: [],
      clientQuery,
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
    result.match === 'ambiguous'
      ? `${result.clientChoices.length} clients match ${result.clientQuery}: ${joinNames(result.clientChoices)}. Ask again with the full name.`
      : result.clientQuery && result.match === 'none'
        ? `No client named ${result.clientQuery} on file.`
        : result.dateProblem
          ? `No rows: I did not understand the date "${result.dateProblem}".`
          : result.count === 0
            ? 'No estimates match that.'
            : `${result.count} ${result.count === 1 ? 'estimate' : 'estimates'}, ${result.total?.amount ?? ''} in total.`,
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
      clientChoices: [],
      clientQuery: '',
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

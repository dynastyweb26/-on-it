// ═══ Tool · get_client_summary (read) ═══
//
// One client, three tiles: what they still owe, what they have paid, and how
// many documents are open. An ambiguous name is never summarised — the caller
// gets the matches back and must ask which one.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps, StatTilesProps } from '@/lib/templates/props';
import { booksTotals } from '@/lib/books-totals';
import { ClientRow, asInvoiceRow, joinNames, moneyText, normName, num, resolveClient } from '../read';

export const GET_CLIENT_SUMMARY = 'get_client_summary';

export const GetClientSummaryInput = z.object({ name: z.string().min(1).max(120) }).strict();

export const GetClientSummaryOutput = z.object({
  /** ambiguous: the name matched several clients, so there are no figures. */
  match: z.enum(['none', 'one', 'many', 'ambiguous']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  tiles: z.array(
    z.object({
      label: z.string().min(1),
      value: z.string().min(1),
      tone: z.enum(['in', 'out', 'neutral']),
      period: z.string(),
      change: z.object({ dir: z.enum(['up', 'down', 'flat']), text: z.string().min(1) }).optional(),
    }),
  ),
  rows: RankedListProps.shape.rows,
  totalCount: z.number().int().nonnegative(),
  /** Null when there is no answer to total: several clients, or none on file. */
  total: RankedListProps.shape.total.nullable(),
  /** id is null for a client who only appears on documents (no clients row). */
  clients: z.array(z.object({ id: z.string().nullable(), name: z.string() })),
  /** The client names to ask about when `match` is ambiguous, sorted. */
  clientChoices: z.array(z.string()),
  /** The name the user said, as it reached the tool. */
  clientQuery: z.string(),
  summary: z
    .object({
      clientName: z.string(),
      owed: z.string(),
      paid: z.string(),
      open: z.number().int().nonnegative(),
      estimates: z.number().int().nonnegative(),
    })
    .nullable(),
});

const fixture = {
  args: { name: 'Ruth Lawrence' },
  result: {
    match: 'one' as const,
    count: 1,
    ignored: [] as string[],
    eyebrow: 'Ruth Lawrence',
    title: 'Since you started.',
    tiles: [
      { label: 'Owed', value: '$120.00', tone: 'neutral' as const, period: 'unpaid' },
      { label: 'Paid', value: '$0.00', tone: 'in' as const, period: 'all time' },
      { label: 'Open', value: '1', tone: 'neutral' as const, period: 'docs' },
    ],
    rows: [{ name: 'Ruth Lawrence', secondary: 'INV-0001 · Due Sep 1', amount: '$120.00', tone: 'neutral' as const }],
    totalCount: 1,
    total: { label: '1 client', amount: '$120.00', tone: 'neutral' as const },
    clients: [{ id: 'cli-1', name: 'Ruth Lawrence' }],
    clientChoices: [] as string[],
    clientQuery: 'Ruth Lawrence',
    summary: { clientName: 'Ruth Lawrence', owed: '$120.00', paid: '$0.00', open: 1, estimates: 0 },
  },
};

export const getClientSummaryTool = defineTool({
  name: GET_CLIENT_SUMMARY,
  description:
    'Read-only summary of ONE client: what they still owe, what they have paid all time, how many documents are open and how many estimates they have. Drafts, void rows and estimates never count toward owed; paid is money actually received, not the period. The tool resolves the name itself; if it matches more than one client it returns their names instead of guessing, with no figures at all, and you must ask which one.',
  input: GetClientSummaryInput,
  output: GetClientSummaryOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'stat.tiles', props: StatTilesProps },
  alternateTemplate: { id: 'list.ranked', props: RankedListProps },
  templateFor: (result) => {
    // One client is three tiles. Several clients, or nobody, is the server's
    // own sentence and no card: a card here would show somebody else's money
    // under a name that is not theirs.
    return result.match === 'one' ? 'stat.tiles' : null;
  },
  destination: { screen: 'Clients', path: '/clients' },
  handler: async (ctx, args) => {
    const [clients, docs, payments] = await Promise.all([
      ctx.db.select<ClientRow>('clients', {
        columns: '*',
        eq: { user_id: ctx.userId },
        is: { deleted_at: null },
        order: { column: 'name', ascending: true },
      }),
      ctx.db.select('invoices', {
        columns: '*',
        eq: { user_id: ctx.userId },
        is: { deleted_at: null },
      }),
      ctx.db.select<{ invoice_id: string; amount: number | string }>('invoice_payments', {
        columns: 'invoice_id, amount',
        eq: { user_id: ctx.userId },
      }),
    ]);
    if (clients.error) throw new Error(clients.error.message);
    if (docs.error) throw new Error(docs.error.message);
    if (payments.error) throw new Error(payments.error.message);

    const clientQuery = args.name;
    // The tool decides who the name is, from the clients table and from every
    // live document: the model never guesses between people.
    const resolved = await resolveClient(ctx, clientQuery);
    if (resolved.kind !== 'one') {
      const many = resolved.kind === 'many';
      return {
        match: many ? ('ambiguous' as const) : ('none' as const),
        count: 0,
        ignored: [],
        eyebrow: 'Clients',
        title: many ? 'Which one?' : '',
        tiles: [],
        rows: [],
        totalCount: 0,
        total: null,
        clients: [],
        clientChoices: many ? resolved.names : [],
        clientQuery,
        summary: null,
      };
    }

    const who = normName(resolved.name);
    const clientRow = (clients.data ?? []).find((row) => normName(row.name) === who);
    const clientName = clientRow?.name ?? resolved.name;
    const live = (docs.data ?? []).map(asInvoiceRow).filter((doc) => normName(doc.client_name) === who);

    let owedTotal = 0;
    let open = 0;
    let estimates = 0;
    for (const doc of live) {
      if (doc.kind === 'quote') {
        estimates += 1;
        continue;
      }
      if (doc.status === 'paid' || doc.status === 'void' || doc.status === 'draft') continue;
      owedTotal += Math.max(0, num(doc.total) - num(doc.amount_paid));
      open += 1;
    }

    // Paid is money received, from the payment ledger — the same rows Books
    // Collected counts, through the same calculation. A part payment on an open
    // invoice is money in the moment it arrives, a refund nets out as its
    // negative row, and an invoice's status never invents an amount. Only this
    // client's live invoices count, exactly as list_payments scopes its rows.
    const invoiceIds = new Set(live.filter((doc) => doc.kind !== 'quote').map((doc) => doc.id));
    const received = (payments.data ?? []).filter((row) => invoiceIds.has(row.invoice_id));
    const paid = booksTotals({ payments: received, expenses: [], invoices: [] }).collected;
    const contact = clientRow?.email ?? clientRow?.phone ?? 'Client';

    return {
      match: 'one' as const,
      count: 1,
      ignored: [],
      eyebrow: clientName,
      title: 'Since you started.',
      // Three tiles at 390 wide: each label and its sub must stay short enough
      // to print in full. 'Still owed' / 'Open documents' / 'invoices and
      // estimates' did not.
      tiles: [
        { label: 'Owed', value: moneyText(owedTotal), tone: 'neutral' as const, period: 'unpaid' },
        { label: 'Paid', value: moneyText(paid), tone: 'in' as const, period: 'all time' },
        { label: 'Open', value: String(open), tone: 'neutral' as const, period: 'docs' },
      ],
      rows: [{ name: clientName, secondary: `${contact} · ${moneyText(owedTotal)}`, amount: moneyText(owedTotal), tone: 'neutral' as const }],
      totalCount: 1,
      total: { label: '1 client', amount: moneyText(owedTotal), tone: 'neutral' as const },
      clients: [{ id: clientRow?.id ?? null, name: clientName }],
      clientChoices: [],
      clientQuery,
      summary: { clientName, owed: moneyText(owedTotal), paid: moneyText(paid), open, estimates },
    };
  },
  fallback: (result) =>
    result.match === 'ambiguous'
      ? `${result.clientChoices.length} clients match ${result.clientQuery}: ${joinNames(result.clientChoices)}. Ask again with the full name.`
      : result.match === 'none'
        ? `No client named ${result.clientQuery} on file.`
        : result.summary
          ? `${result.summary.clientName} owes ${result.summary.owed} across ${result.summary.open} open ${result.summary.open === 1 ? 'document' : 'documents'}.`
          : 'No client named that on file.',
  fixture,
});

// ═══ Tool · get_client_summary (read) ═══
//
// One client, three tiles: what they still owe, what they have paid, and how
// many documents are open. An ambiguous name is never summarised — the caller
// gets the matches back and must ask which one.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps, StatTilesProps } from '@/lib/templates/props';
import { booksTotals } from '@/lib/books-totals';
import { ClientRow, asInvoiceRow, matchOf, moneyText, nameMatches, num } from '../read';

export const GET_CLIENT_SUMMARY = 'get_client_summary';

export const GetClientSummaryInput = z.object({ name: z.string().min(1).max(120) }).strict();

export const GetClientSummaryOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
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
  total: RankedListProps.shape.total,
  clients: z.array(z.object({ id: z.string(), name: z.string() })),
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
    summary: { clientName: 'Ruth Lawrence', owed: '$120.00', paid: '$0.00', open: 1, estimates: 0 },
  },
};

export const getClientSummaryTool = defineTool({
  name: GET_CLIENT_SUMMARY,
  description:
    'Read-only summary of ONE client: what they still owe right now, what they have paid all time, and how many documents (invoices and estimates) are still open. "Does Maria owe me anything?" and "how much has Ruth paid me?" are this tool. If the name matches more than one client the tool returns the matches instead of guessing; use find_client to list them.',
  input: GetClientSummaryInput,
  output: GetClientSummaryOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'stat.tiles', props: StatTilesProps },
  alternateTemplate: { id: 'list.ranked', props: RankedListProps },
  templateFor: (result) => {
    const count = (result as { count: number }).count;
    // No client by that name: plain text, not an empty card.
    if (count === 0) return null;
    return count === 1 ? 'stat.tiles' : 'list.ranked';
  },
  destination: { screen: 'Clients', path: '/clients' },
  handler: async (ctx, args) => {
    const clients = await ctx.db.select<ClientRow>('clients', {
      columns: '*',
      eq: { user_id: ctx.userId },
      order: { column: 'name', ascending: true },
    });
    if (clients.error) throw new Error(clients.error.message);

    const matched = (clients.data ?? []).filter((c) => nameMatches(args.name, c.name));
    const [docs, payments] = await Promise.all([
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
    if (docs.error) throw new Error(docs.error.message);
    if (payments.error) throw new Error(payments.error.message);

    // What each matched client still owes, from the caller's own documents.
    // Nothing here is a literal: every figure is summed from rows.
    const owed = new Map<string, number>();
    for (const raw of docs.data ?? []) {
      const doc = asInvoiceRow(raw);
      if (doc.kind === 'quote' || doc.status === 'paid' || doc.status === 'void') continue;
      const key = doc.client_name.trim().toLowerCase();
      owed.set(key, (owed.get(key) ?? 0) + Math.max(0, num(doc.total) - num(doc.amount_paid)));
    }
    const owedBy = (name: string) => moneyText(owed.get(name.trim().toLowerCase()) ?? 0);
    const line = (c: ClientRow) => `${c.email ?? c.phone ?? 'Client'} · ${owedBy(c.name)}`;

    const base = {
      match: matchOf(matched.length),
      count: matched.length,
      ignored: [] as string[],
      eyebrow: matched.length === 1 ? matched[0].name : 'Clients',
      title: matched.length === 1 ? 'Since you started.' : 'Which one?',
      rows: matched.map((c) => ({ name: c.name, secondary: line(c), amount: owedBy(c.name), tone: 'neutral' as const })),
      totalCount: matched.length,
      total: {
        label: `${matched.length} ${matched.length === 1 ? 'client' : 'clients'}`,
        amount: moneyText(matched.reduce((sum, c) => sum + (owed.get(c.name.trim().toLowerCase()) ?? 0), 0)),
        tone: 'neutral' as const,
      },
      clients: matched.map((c) => ({ id: c.id, name: c.name })),
    };
    if (matched.length !== 1) return { ...base, tiles: [], summary: null };

    const who = matched[0].name.trim().toLowerCase();
    let owedTotal = 0;
    let open = 0;
    let estimates = 0;
    for (const raw of docs.data ?? []) {
      const doc = asInvoiceRow(raw);
      if (doc.client_name.trim().toLowerCase() !== who) continue;
      if (doc.kind === 'quote') {
        estimates += 1;
        continue;
      }
      if (doc.status === 'paid') continue;
      if (doc.status === 'void' || doc.status === 'draft') continue;
      owedTotal += Math.max(0, num(doc.total) - num(doc.amount_paid));
      open += 1;
    }

    // Paid is money received, from the payment ledger — the same rows Books
    // Collected counts, through the same calculation. A part payment on an open
    // invoice is money in the moment it arrives, a refund nets out as its
    // negative row, and an invoice's status never invents an amount. Only this
    // client's live invoices count, exactly as list_payments scopes its rows.
    const invoiceClient = new Map<string, string>();
    for (const raw of docs.data ?? []) {
      const doc = asInvoiceRow(raw);
      if (doc.kind === 'quote') continue;
      invoiceClient.set(doc.id, doc.client_name.trim().toLowerCase());
    }
    const received = (payments.data ?? []).filter(
      (row) => invoiceClient.get(row.invoice_id) === who,
    );
    const paid = booksTotals({ payments: received, expenses: [], invoices: [] }).collected;

    return {
      ...base,
      // Three tiles at 390 wide: each label and its sub must stay short enough
      // to print in full. 'Still owed' / 'Open documents' / 'invoices and
      // estimates' did not.
      tiles: [
        { label: 'Owed', value: moneyText(owedTotal), tone: 'neutral' as const, period: 'unpaid' },
        { label: 'Paid', value: moneyText(paid), tone: 'in' as const, period: 'all time' },
        { label: 'Open', value: String(open), tone: 'neutral' as const, period: 'docs' },
      ],
      summary: { clientName: matched[0].name, owed: moneyText(owedTotal), paid: moneyText(paid), open, estimates },
    };
  },
  fallback: (result) =>
    result.summary
      ? `${result.summary.clientName} owes ${result.summary.owed} across ${result.summary.open} open ${result.summary.open === 1 ? 'document' : 'documents'}.`
      : result.count === 0
        ? 'No client matches that name.'
        : `${result.count} clients match; say which one you mean.`,
  fixture,
});

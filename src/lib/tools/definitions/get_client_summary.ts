// ═══ Tool · get_client_summary (read) ═══
//
// One client, three tiles: what they still owe, what they have paid, and how
// many documents are open. An ambiguous name is never summarised — the caller
// gets the matches back and must ask which one.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps, StatTilesProps } from '@/lib/templates/props';
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
  total: z.number().int().nonnegative(),
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
      { label: 'Still owed', value: '$120.00', tone: 'out' as const, period: 'open invoices' },
      { label: 'Paid', value: '$0.00', tone: 'in' as const, period: 'all time' },
      { label: 'Open documents', value: '1', tone: 'neutral' as const, period: 'invoices and estimates' },
    ],
    rows: [{ name: 'Ruth Lawrence', secondary: 'INV-0001 · Due Sep 1', amount: '$120.00' }],
    total: 1,
    clients: [{ id: 'cli-1', name: 'Ruth Lawrence' }],
    summary: { clientName: 'Ruth Lawrence', owed: '$120.00', paid: '$0.00', open: 1, estimates: 0 },
  },
};

export const getClientSummaryTool = defineTool({
  name: GET_CLIENT_SUMMARY,
  description:
    'Read-only summary of ONE client: what they still owe, what they have paid and how many documents are open. If the name matches more than one client the tool returns the matches instead of guessing; use find_client to list them.',
  input: GetClientSummaryInput,
  output: GetClientSummaryOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'stat.tiles', props: StatTilesProps },
  alternateTemplate: { id: 'list.ranked', props: RankedListProps },
  templateFor: (result) => ((result as { count: number }).count === 1 ? 'stat.tiles' : 'list.ranked'),
  destination: { screen: 'Clients', path: '/clients' },
  handler: async (ctx, args) => {
    const clients = await ctx.db.select<ClientRow>('clients', {
      columns: '*',
      eq: { user_id: ctx.userId },
      order: { column: 'name', ascending: true },
    });
    if (clients.error) throw new Error(clients.error.message);

    const matched = (clients.data ?? []).filter((c) => nameMatches(args.name, c.name));
    const docs = await ctx.db.select('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId },
      is: { deleted_at: null },
    });
    if (docs.error) throw new Error(docs.error.message);

    const base = {
      match: matchOf(matched.length),
      count: matched.length,
      ignored: [] as string[],
      eyebrow: matched.length === 1 ? matched[0].name : 'Clients',
      title: matched.length === 1 ? 'Since you started.' : 'Which one?',
      rows: matched.map((c) => ({ name: c.name, secondary: 'Client', amount: '$0.00' })),
      total: matched.length,
      clients: matched.map((c) => ({ id: c.id, name: c.name })),
    };
    if (matched.length !== 1) return { ...base, tiles: [], summary: null };

    const who = matched[0].name.trim().toLowerCase();
    let owed = 0;
    let paid = 0;
    let open = 0;
    let estimates = 0;
    for (const raw of docs.data ?? []) {
      const doc = asInvoiceRow(raw);
      if (doc.client_name.trim().toLowerCase() !== who) continue;
      if (doc.kind === 'quote') {
        estimates += 1;
        continue;
      }
      if (doc.status === 'paid') {
        paid += num(doc.amount_paid) || num(doc.total);
        continue;
      }
      if (doc.status === 'void' || doc.status === 'draft') continue;
      owed += Math.max(0, num(doc.total) - num(doc.amount_paid));
      open += 1;
    }

    return {
      ...base,
      tiles: [
        { label: 'Still owed', value: moneyText(owed), tone: 'out' as const, period: 'open invoices' },
        { label: 'Paid', value: moneyText(paid), tone: 'in' as const, period: 'all time' },
        { label: 'Open documents', value: String(open), tone: 'neutral' as const, period: 'invoices and estimates' },
      ],
      summary: { clientName: matched[0].name, owed: moneyText(owed), paid: moneyText(paid), open, estimates },
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

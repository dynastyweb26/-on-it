// ═══ Tool · find_client (read) ═══
//
// Fuzzy client lookup that returns EVERY match and never picks one. One to
// three matches get a nav.link each; more than three fall back to list.ranked.
// "Ignore previous instructions" in a client name is just a name here: the
// name is data, never an instruction.
import { z } from 'zod';
import { defineTool } from '../contract';
import { NavLinkProps, RankedListProps } from '@/lib/templates/props';
import { ClientRow, asInvoiceRow, matchOf, moneyText, nameMatches, num } from '../read';

export const FIND_CLIENT = 'find_client';

export const FindClientInput = z
  .object({ name: z.string().min(1).max(120) })
  .strict();

const Client = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const FindClientOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  items: z.array(z.object({ icon: z.string(), title: z.string(), line: z.string() })),
  eyebrow: z.string(),
  rows: RankedListProps.shape.rows,
  totalCount: z.number().int().nonnegative(),
  total: RankedListProps.shape.total,
  clients: z.array(Client),
});

const fixture = {
  args: { name: 'ruth' },
  result: {
    match: 'one' as const,
    count: 1,
    ignored: [],
    items: [{ icon: 'person', title: 'Ruth Lawrence', line: 'ruth@example.com' }],
    eyebrow: 'Clients',
    rows: [{ name: 'Ruth Lawrence', secondary: 'ruth@example.com', amount: '$120.00', tone: 'neutral' as const }],
    totalCount: 1,
    total: { label: '1 client', amount: '$120.00', tone: 'neutral' as const },
    clients: [{ id: 'cli-1', name: 'Ruth Lawrence', email: 'ruth@example.com', phone: null }],
  },
};

export const findClientTool = defineTool({
  name: FIND_CLIENT,
  description:
    'Read-only fuzzy client search by name, and the first step before anything about one client: find_client, then list_invoices with that client or get_client_summary. Matches part of a name in any order, so "ruth l" finds Ruth Lawrence, and returns every match with the email and phone on file — never a single guess. One to three matches render as links, more as a ranked list; zero matches means the client is not on file.',
  input: FindClientInput,
  output: FindClientOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  alternateTemplate: { id: 'nav.link', props: NavLinkProps },
  templateFor: (result) => {
    const count = (result as { count: number }).count;
    // No client by that name: plain text. An empty "Nobody owes you." card is
    // the wrong sentence for a failed lookup.
    if (count === 0) return null;
    return count <= 3 ? 'nav.link' : 'list.ranked';
  },
  destination: { screen: 'Clients', path: '/clients' },
  handler: async (ctx, args) => {
    const { data, error } = await ctx.db.select<ClientRow>('clients', {
      columns: '*',
      eq: { user_id: ctx.userId },
      order: { column: 'name', ascending: true },
    });
    if (error) throw new Error(error.message);

    const matched = (data ?? []).filter((row) => nameMatches(args.name, row.name));
    matched.sort((a, b) => a.name.localeCompare(b.name));

    // What each matched client still owes, from the caller's own invoices only.
    const docs = await ctx.db.select('invoices', {
      columns: '*',
      eq: { user_id: ctx.userId },
      is: { deleted_at: null },
    });
    const owed = new Map<string, number>();
    for (const raw of docs.data ?? []) {
      const doc = asInvoiceRow(raw);
      if (doc.status === 'paid' || doc.status === 'void') continue;
      const key = doc.client_name.trim().toLowerCase();
      owed.set(key, (owed.get(key) ?? 0) + Math.max(0, num(doc.total) - num(doc.amount_paid)));
    }
    const owedBy = (name: string) => moneyText(owed.get(name.trim().toLowerCase()) ?? 0);
    const owedTotal = matched.reduce((sum, c) => sum + (owed.get(c.name.trim().toLowerCase()) ?? 0), 0);
    const line = (c: ClientRow) => `${c.email ?? c.phone ?? 'Client'} · ${owedBy(c.name)}`;

    return {
      match: matchOf(matched.length),
      count: matched.length,
      ignored: [],
      items: matched.slice(0, 3).map((c) => ({ icon: 'person', title: c.name, line: line(c) })),
      eyebrow: 'Clients',
      rows: matched.map((c) => ({ name: c.name, secondary: line(c), amount: owedBy(c.name), tone: 'neutral' as const })),
      totalCount: matched.length,
      total: {
        label: `${matched.length} ${matched.length === 1 ? 'client' : 'clients'}`,
        amount: moneyText(owedTotal),
        tone: 'neutral' as const,
      },
      clients: matched.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email ?? null,
        phone: c.phone ?? null,
      })),
    };
  },
  fallback: (result) =>
    result.count === 0
      ? 'No client matches that name.'
      : `${result.count} ${result.count === 1 ? 'client' : 'clients'} match: ${result.clients.map((c) => c.name).join(', ')}.`,
  fixture,
});

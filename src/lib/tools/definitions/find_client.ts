// ═══ Tool · find_client (read) ═══
//
// Fuzzy client lookup that returns EVERY match and never picks one. One to
// three matches get a nav.link each; more than three fall back to list.ranked.
// "Ignore previous instructions" in a client name is just a name here: the
// name is data, never an instruction.
import { z } from 'zod';
import { defineTool } from '../contract';
import { NavLinkProps, RankedListProps } from '@/lib/templates/props';
import { ClientRow, asInvoiceRow, matchOf, moneyText, normName, num, resolveClient } from '../read';

export const FIND_CLIENT = 'find_client';

export const FindClientInput = z
  .object({ name: z.string().min(1).max(120) })
  .strict();

const Client = z.object({
  /** Null for a client who only appears on documents (no clients row). */
  id: z.string().nullable(),
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
  /** The name the user said, as it reached the tool. */
  clientQuery: z.string(),
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
    clientQuery: 'ruth',
  },
};

export const findClientTool = defineTool({
  name: FIND_CLIENT,
  description:
    'Read-only client search by name, for one question only: whether someone is a client, and their contact details. It searches the clients table and every client name on your invoices, estimates and payments, so it agrees with the records tools. Returns every match, never a single guess, with contact details and what that client still owes; one to three render as links, more as a ranked list. Records for a client belong to list_invoices, list_estimates, list_payments or get_client_summary, not here.',
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
    const [clients, docs] = await Promise.all([
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
    ]);
    if (clients.error) throw new Error(clients.error.message);
    if (docs.error) throw new Error(docs.error.message);

    const clientQuery = args.name;
    // The same candidates every other client tool resolves against: the clients
    // table plus every client name on a live invoice, estimate or payment. An
    // invoice-only client is a client here too.
    const resolved = await resolveClient(ctx, clientQuery);
    const names = resolved.kind === 'one' ? [resolved.name]
      : resolved.kind === 'many' ? resolved.names
        : [];
    const rowFor = (name: string) =>
      (clients.data ?? []).find((row) => normName(row.name) === normName(name));

    // What each matched client still owes, from the caller's own invoices only.
    const owed = new Map<string, number>();
    for (const raw of docs.data ?? []) {
      const doc = asInvoiceRow(raw);
      if (doc.status === 'paid' || doc.status === 'void') continue;
      const key = normName(doc.client_name);
      owed.set(key, (owed.get(key) ?? 0) + Math.max(0, num(doc.total) - num(doc.amount_paid)));
    }
    const owedBy = (name: string) => moneyText(owed.get(normName(name)) ?? 0);
    const owedTotal = names.reduce((sum, name) => sum + (owed.get(normName(name)) ?? 0), 0);
    const contact = (row: ClientRow | undefined) => row?.email ?? row?.phone ?? 'Client';
    const line = (name: string) => `${contact(rowFor(name))} · ${owedBy(name)}`;

    return {
      match: matchOf(names.length),
      count: names.length,
      ignored: [],
      items: names.slice(0, 3).map((name) => ({ icon: 'person', title: name, line: line(name) })),
      eyebrow: 'Clients',
      rows: names.map((name) => ({ name, secondary: line(name), amount: owedBy(name), tone: 'neutral' as const })),
      totalCount: names.length,
      total: {
        label: `${names.length} ${names.length === 1 ? 'client' : 'clients'}`,
        amount: moneyText(owedTotal),
        tone: 'neutral' as const,
      },
      clients: names.map((name) => {
        const row = rowFor(name);
        return {
          id: row?.id ?? null,
          name,
          email: row?.email ?? null,
          phone: row?.phone ?? null,
        };
      }),
      clientQuery,
    };
  },
  fallback: (result) =>
    result.count === 0
      ? `No client named ${result.clientQuery} on file.`
      : `${result.count} ${result.count === 1 ? 'client' : 'clients'} match: ${result.clients.map((c) => c.name).join(', ')}.`,
  fixture,
});

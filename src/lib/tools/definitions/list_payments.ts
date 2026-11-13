// ═══ Tool · list_payments (read) ═══
//
// Money received, newest first: the invoice_payments ledger (including refund
// and dispute rows, signed as Books counts them) plus other_income rows that
// are not tied to an invoice. The list total is the same Collected figure the
// Books tab shows for the same range — it uses booksTotals(), not a second sum.
import { z } from 'zod';
import { defineTool } from '../contract';
import { RankedListProps } from '@/lib/templates/props';
import { formatDocNumber } from '@/lib/documents';
import { METHOD_LABELS, ledgerEntryLabel } from '@/lib/payment-methods';
import { countsAsIncome, type OtherIncomeRow } from '@/lib/other-income';
import { booksTotals } from '@/lib/books-totals';
import { localYmd, resolveTimeZone } from '@/lib/recap/dates';
import {
  READ_CAP,
  forgivingFilters,
  matchOf,
  moneyText,
  nameMatches,
  normName,
  num,
  toIso,
} from '../read';
import { moneyIn, moneyOut } from '../money';

export const LIST_PAYMENTS = 'list_payments';

export const ListPaymentsInput = z
  .object({
    client: z.string().max(120).optional(),
    method: z.string().max(40).optional(),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
    min_amount: z.number().finite().min(0).max(10_000_000).optional(),
    max_amount: z.number().finite().min(0).max(10_000_000).optional(),
    limit: z.number().int().min(1).max(READ_CAP).optional(),
  })
  .strict();

const Payment = z.object({
  id: z.string(),
  kind: z.enum(['invoice_payment', 'other_income']),
  clientName: z.string(),
  invoiceNumber: z.string().nullable(),
  method: z.string(),
  day: z.string(),
  /** Finished and signed: + for money in, U+2212 for a refund or dispute. */
  amount: z.string(),
});

export const ListPaymentsOutput = z.object({
  match: z.enum(['none', 'one', 'many']),
  count: z.number().int().nonnegative(),
  ignored: z.array(z.string()),
  eyebrow: z.string().min(1),
  title: z.string(),
  totalCount: z.number().int().nonnegative(),
  rows: RankedListProps.shape.rows,
  total: RankedListProps.shape.total,
  payments: z.array(Payment),
});

type InvoiceLite = {
  id: string;
  kind: string | null;
  invoice_number: number | null;
  client_name: string | null;
  deleted_at: string | null;
};

type LedgerRow = {
  id: string;
  invoice_id: string;
  amount: number | string;
  method: string | null;
  paid_at: string | null;
  created_at: string | null;
  entry_type: string | null;
  stripe_checkout_session_id: string | null;
};

const aliases: Record<string, string> = {
  'cash app': 'cashapp',
  cash_app: 'cashapp',
  'bank transfer': 'bank',
  'bank_transfer': 'bank',
};

function forgivingMethod(value: string | undefined): { method?: string; ignored: string[] } {
  const raw = value?.trim();
  if (!raw) return { ignored: [] };
  const key = normName(raw);
  if (Object.keys(METHOD_LABELS).includes(key)) return { method: key, ignored: [] };
  const byLabel = Object.entries(METHOD_LABELS).find(([, label]) => normName(label) === key);
  if (byLabel) return { method: byLabel[0], ignored: [] };
  if (aliases[key]) return { method: aliases[key], ignored: [] };
  return { ignored: [raw] };
}

const fixtureInvoices: InvoiceLite[] = [
  { id: 'inv-7', kind: 'invoice', invoice_number: 7, client_name: 'Maria Santos', deleted_at: null },
  { id: 'inv-8', kind: 'invoice', invoice_number: 8, client_name: 'Ruth Lawrence', deleted_at: null },
];

export const listPaymentsTool = defineTool({
  name: LIST_PAYMENTS,
  description:
    'Read-only list of money received, newest first: invoice payments (refunds and disputes appear as signed negative rows) plus other income that is not tied to an invoice. The list total equals the Books Collected figure for the same range. Supports client, method, date and amount filters; at most 25 rows plus the full count.',
  input: ListPaymentsInput,
  output: ListPaymentsOutput,
  type: 'read',
  risk: 'low',
  defaultTemplate: { id: 'list.ranked', props: RankedListProps },
  destination: { screen: 'Income', path: '/income' },
  handler: async (ctx, args) => {
    const { filters, ignored } = forgivingFilters({
      from: args.from,
      to: args.to,
      min_amount: args.min_amount,
      max_amount: args.max_amount,
    });
    const method = forgivingMethod(args.method);
    ignored.push(...method.ignored);

    const profile = await ctx.db.select<{ timezone: string | null }>('profiles', {
      columns: 'timezone',
      eq: { id: ctx.userId },
    });
    if (profile.error) throw new Error(profile.error.message);
    const tz = resolveTimeZone(profile.data?.[0]?.timezone);

    const [payRes, invRes, otherRes] = await Promise.all([
      ctx.db.select<LedgerRow>('invoice_payments', {
        columns: '*',
        eq: { user_id: ctx.userId },
        order: { column: 'paid_at', ascending: false },
      }),
      ctx.db.select<InvoiceLite>('invoices', {
        columns: 'id, kind, invoice_number, client_name, deleted_at',
        eq: { user_id: ctx.userId },
      }),
      ctx.db.select<OtherIncomeRow & { id?: string; title?: string | null; client_name?: string | null; received_on?: string | null; created_at?: string | null }>('other_income', {
        columns: '*',
        eq: { user_id: ctx.userId },
        is: { deleted_at: null },
        order: { column: 'received_on', ascending: false },
      }),
    ]);
    if (payRes.error) throw new Error(payRes.error.message);
    if (invRes.error) throw new Error(invRes.error.message);
    if (otherRes.error) throw new Error(otherRes.error.message);

    const invoices = new Map((invRes.data ?? []).map((row) => [row.id, row]));
    const inRange = (day: string) =>
      day !== '' && (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to);
    const inAmount = (amount: number) =>
      (filters.min_amount === undefined || Math.abs(amount) >= filters.min_amount)
      && (filters.max_amount === undefined || Math.abs(amount) <= filters.max_amount);

    type Line = {
      id: string;
      kind: 'invoice_payment' | 'other_income';
      clientName: string;
      invoiceNumber: string | null;
      method: string;
      methodKey: string;
      day: string;
      createdAt: string;
      amount: number;
      /** The amount rows that go into booksTotals, per kind. */
      ledger: boolean;
    };
    const lines: Line[] = [];

    for (const p of payRes.data ?? []) {
      const inv = invoices.get(p.invoice_id);
      if (!inv || inv.deleted_at || (inv.kind ?? 'invoice') !== 'invoice') continue;
      const amount = num(p.amount);
      const day = toIso(p.paid_at) ? localYmd(tz, new Date(toIso(p.paid_at) as string)) : '';
      const clientName = inv.client_name ?? 'Client';
      const methodKey = (p.method ?? 'other').toLowerCase();
      if (!inRange(day) || !inAmount(amount)) continue;
      if (filters.client && !nameMatches(filters.client, clientName)) continue;
      if (method.method && methodKey !== method.method) continue;
      lines.push({
        id: p.id,
        kind: 'invoice_payment',
        clientName,
        invoiceNumber: inv.invoice_number == null ? null : formatDocNumber('invoice', inv.invoice_number),
        method: ledgerEntryLabel(p.entry_type, methodKey, Boolean(p.stripe_checkout_session_id), amount),
        methodKey,
        day,
        createdAt: toIso(p.created_at) ?? day,
        amount,
        ledger: true,
      });
    }

    for (const o of otherRes.data ?? []) {
      if (!countsAsIncome(o.classification)) continue;
      const amount = num(o.amount);
      if (!inAmount(amount)) continue;
      const day = (toIso(o.received_on) ?? '').slice(0, 10);
      const clientName = (o.client_name ?? '').trim() || (o.title ?? '').trim() || 'Other income';
      if (!inRange(day)) continue;
      if (filters.client && !nameMatches(filters.client, clientName)) continue;
      // Other income has no payment method; a method filter excludes it, and the
      // ignored list says why the row is absent.
      if (method.method && method.method !== 'other') continue;
      lines.push({
        id: o.id ?? `other-${day}-${lines.length}`,
        kind: 'other_income',
        clientName,
        invoiceNumber: null,
        method: 'Other income',
        methodKey: 'other',
        day,
        createdAt: toIso(o.created_at) ?? day,
        amount,
        ledger: false,
      });
    }

    lines.sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt));
    const shown = lines.slice(0, args.limit ?? READ_CAP);
    const count = lines.length;

    const totals = booksTotals({
      payments: lines.filter((line) => line.ledger).map((line) => ({ amount: line.amount })),
      otherIncome: (otherRes.data ?? []).filter((row) =>
        countsAsIncome(row.classification)
        && inRange((toIso(row.received_on) ?? '').slice(0, 10))
        && inAmount(num(row.amount))
        && (!filters.client || nameMatches(filters.client, (row.client_name ?? '').trim() || (row.title ?? '').trim() || 'Other income'))
        && (!method.method || method.method === 'other'),
      ),
      expenses: [],
      invoices: [],
    });

    const signed = (amount: number) =>
      amount < 0 ? moneyOut(amount).text : moneyIn(amount).text;

    return {
      match: matchOf(count),
      count,
      ignored,
      eyebrow: 'Payments received',
      title: count ? 'Newest first.' : '',
      totalCount: count,
      rows: shown.map((line) => ({
        name: line.clientName,
        secondary: line.kind === 'other_income'
          ? `Not tied to an invoice · ${line.method} · ${line.day}`
          : `${line.invoiceNumber ?? 'Invoice'} · ${line.method} · ${line.day}`,
        amount: signed(line.amount),
        tone: (line.amount < 0 ? 'out' : 'in') as 'in' | 'out',
      })),
      total: {
        label: `${count} ${count === 1 ? 'payment' : 'payments'}`,
        amount: moneyText(totals.collected),
      },
      payments: shown.map((line) => ({
        id: line.id,
        kind: line.kind,
        clientName: line.clientName,
        invoiceNumber: line.invoiceNumber,
        method: line.method,
        day: line.day,
        amount: signed(line.amount),
      })),
    };
  },
  fallback: (result) =>
    result.count === 0
      ? 'No payments match that.'
      : `${result.count} ${result.count === 1 ? 'payment' : 'payments'}, ${result.total.amount} collected.`,
  fixture: {
    args: { from: '2026-11-01', to: '2026-11-30' },
    result: {
      match: 'many',
      count: 3,
      ignored: [],
      eyebrow: 'Payments received',
      title: 'Newest first.',
      totalCount: 3,
      rows: [
        { name: 'Maria Santos', secondary: 'INV-0007 · Zelle · 2026-11-06', amount: '+$120.00', tone: 'in' },
        { name: 'Other income', secondary: 'Not tied to an invoice · Other income · 2026-11-04', amount: '+$300.00', tone: 'in' },
        { name: 'Ruth Lawrence', secondary: 'INV-0008 · Refund · 2026-11-02', amount: '\u2212$20.00', tone: 'out' },
      ],
      total: { label: '3 payments', amount: '$405.00' },
      payments: [
        { id: 'p1', kind: 'invoice_payment', clientName: 'Maria Santos', invoiceNumber: 'INV-0007', method: 'Zelle', day: '2026-11-06', amount: '+$120.00' },
        { id: 'o1', kind: 'other_income', clientName: 'Other income', invoiceNumber: null, method: 'Other income', day: '2026-11-04', amount: '+$300.00' },
        { id: 'p2', kind: 'invoice_payment', clientName: 'Ruth Lawrence', invoiceNumber: 'INV-0008', method: 'Refund', day: '2026-11-02', amount: '\u2212$20.00' },
      ],
    },
  },
});

export const paymentFixture = {
  invoices: fixtureInvoices,
  payments: [
    { id: 'p1', invoice_id: 'inv-7', amount: '120.00', method: 'zelle', paid_at: '2026-11-06T17:00:00Z', created_at: '2026-11-06T17:00:00Z', entry_type: 'payment', stripe_checkout_session_id: null },
    { id: 'p2', invoice_id: 'inv-8', amount: '-20.00', method: 'card', paid_at: '2026-11-02T17:00:00Z', created_at: '2026-11-02T17:00:00Z', entry_type: 'refund', stripe_checkout_session_id: 'cs_1' },
  ],
  otherIncome: [
    { id: 'o1', amount: '300.00', title: 'Side job', client_name: null, received_on: '2026-11-04', classification: 'other_income', deposit_id: null, deleted_at: null, created_at: '2026-11-04T00:00:00Z' },
  ],
};

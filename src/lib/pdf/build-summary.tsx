'use client';
// ═══ Summary PDF builder ═══ One entry point for every books export: expenses
// or income, summary or detailed, over any local date range. It loads its own
// data — by default through the session client (supabaseSource; RLS scopes
// every row to the signed-in user), or from any SummaryPdfSource returning the
// same shapes — renders the white/black document offscreen, and captures it through
// the same elementToPdf pipeline as invoices. The Summary screen calls it with
// the selected period; a weekly/monthly recap can call it with a week's range
// and nothing else.
//
// The summary documents are built exactly as the Summary screen built them
// before (same rollups — summarize / summarizeIncome — same fields), so their
// output is unchanged.
import type { ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createClient } from '@/lib/supabase/client';
import { accentForWhite } from '@/lib/colors';
import { isExpenseCategory } from '@/lib/expenses';
import { calculateLineAmount } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import { summarize, summarizeIncome, type ExpenseLite, type PaymentLite } from '@/lib/tax-summary';
import { elementToPdf, summaryFilename, incomeSummaryFilename } from '@/lib/pdf/generate';
import {
  ExpenseSummaryTemplate, IncomeSummaryTemplate, ExpenseDetailedTemplate, IncomeDetailedTemplate,
  type ExpenseDetailCategory, type IncomeDetailPayment, type IncomeLineItem,
} from '@/lib/pdf/summary-template';

export type SummaryPdfKind = 'expenses' | 'income';
export type SummaryPdfDetail = 'summary' | 'detailed';

export interface SummaryPdfOptions {
  kind: SummaryPdfKind;
  detail: SummaryPdfDetail;
  range: { start: string; end: string }; // local yyyy-mm-dd, inclusive
  periodLabel: string;                   // literal label on the document, never "This Month"
}

// PostgREST caps a response (1000 rows on Supabase), so long periods are read
// in pages. Each query orders on a unique tail so pages never overlap.
const PAGE_ROWS = 1000;
// A detailed income document lists at most this many line items per invoice.
const MAX_LINE_ITEMS = 15;

export type Row = Record<string, unknown>;

export interface SummaryPdfProfile {
  business_name: string;
  logo_url: string | null;
  brand_colors: string[] | null;
  background_color: string | null;
}

/** Where the builder's rows come from. The default reads the database through
 *  the session client; any other source must return the same shapes, already
 *  filtered and ordered as documented, so the rest of the pipeline is shared. */
export interface SummaryPdfSource {
  profile(): Promise<SummaryPdfProfile>;
  /** Non-deleted expenses with spent_on in range, oldest first. */
  expenses(range: SummaryPdfOptions['range'], detailed: boolean): Promise<Row[]>;
  /** Payments on non-deleted invoices of kind 'invoice', paid_at on a local day
   *  in range, oldest first; the invoice embedded as `invoices` (line_items when
   *  detailed). */
  payments(range: SummaryPdfOptions['range'], detailed: boolean): Promise<Row[]>;
  /** Every payment ({ id, invoice_id }) of these invoices, oldest first. */
  paymentHistory(invoiceIds: string[]): Promise<Row[]>;
}

async function fetchAll(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) return out;
  }
}

/** yyyy-mm-dd → "Jan 1, 2026" (local, no UTC day-shift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Local midnight at the start of a yyyy-mm-dd, plus `days`, as an ISO instant.
 *  Payments are bucketed by the LOCAL day of paid_at (localDay), so the range
 *  is [start 00:00 local, end + 1 day 00:00 local). */
function localMidnight(iso: string, days = 0): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d + days).toISOString();
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Build one of the four books PDFs. Throws when signed out, on a query error,
 *  or when the capture fails; the caller decides how to surface that. */
export async function buildSummaryPdf(
  { kind, detail, range, periodLabel }: SummaryPdfOptions,
  source: SummaryPdfSource = supabaseSource(),
): Promise<File> {
  const profile = await source.profile();
  const accent = accentForWhite(profile.brand_colors, profile.background_color ?? null);
  const header = {
    businessName: profile.business_name,
    logoUrl: profile.logo_url ?? null,
    periodLabel,
    rangeStart: prettyDate(range.start),
    rangeEnd: prettyDate(range.end),
    generatedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  };
  const detailed = detail === 'detailed';

  if (kind === 'expenses') {
    const rows = await source.expenses(range, detailed);
    const summary = summarize(rows as unknown as ExpenseLite[]);
    const filename = summaryFilename(periodLabel, header.businessName, detailed);

    if (!detailed) {
      return renderToPdf(
        <ExpenseSummaryTemplate
          d={{
            ...header,
            rows: summary.rows.map((r) => ({ label: r.label, count: r.count, total: r.total, anyDeductible: r.anyDeductible })),
            total: summary.total,
            count: summary.count,
          }}
          accent={accent}
        />,
        filename,
      );
    }

    // Same category key as summarize(), so groups line up with its order.
    // Rows arrive sorted by spent_on (then created_at), oldest first.
    const byCat = new Map<string, Row[]>();
    for (const r of rows) {
      const c = String(r.category ?? '');
      const key = isExpenseCategory(c) ? c : 'other';
      const list = byCat.get(key);
      if (list) list.push(r); else byCat.set(key, [r]);
    }
    const categories: ExpenseDetailCategory[] = summary.rows.map((s) => ({
      label: s.label,
      count: s.count,
      total: s.total,
      rows: (byCat.get(s.category) ?? []).map((r) => {
        const description = String(r.description ?? '').trim();
        const note = String(r.note ?? '').trim();
        const vendor = String(r.vendor ?? '').trim();
        return {
          date: r.spent_on ? prettyDate(String(r.spent_on)) : '—',
          store: vendor || '—',
          description: note ? `${description} — ${note}` : description || '—',
          amount: num(r.amount),
          deductible: Boolean(r.tax_deductible),
          hasReceipt: Boolean(r.receipt_url || r.receipt_path),
        };
      }),
    }));

    return renderToPdf(
      <ExpenseDetailedTemplate d={{ ...header, categories, total: summary.total, count: summary.count }} accent={accent} />,
      filename,
    );
  }

  // ── Income: the payments ledger, cash basis, invoices only (never quotes),
  // soft-deleted invoices excluded — the same filter the Summary screen uses.
  const payRows = await source.payments(range, detailed);

  // Supabase embeds a to-one relation as an object (older shapes: an array);
  // handle both so client_name resolves either way.
  type Emb = { client_name?: string; invoice_number?: number | null; line_items?: unknown };
  const embedded = (r: Row): Emb | undefined => {
    const emb = r.invoices as Emb | Emb[] | null;
    return (Array.isArray(emb) ? emb[0] : emb) ?? undefined;
  };
  const payments: PaymentLite[] = payRows.map((r) => {
    const inv = embedded(r);
    return {
      id: r.id as string,
      amount: r.amount as number | string,
      paid_at: (r.paid_at as string | null) ?? null,
      client_name: inv?.client_name ?? 'Client',
      method: (r.method as string | null) ?? null,
      via_stripe: Boolean(r.stripe_checkout_session_id),
      invoice_number: inv?.invoice_number ?? null,
    };
  });
  // The query already holds the range, so the rollup runs unbounded over it.
  const income = summarizeIncome(payments, [], {
    id: 'range', granularity: 'all', label: periodLabel, friendlyLabel: periodLabel, start: range.start, end: range.end,
  });
  const count = income.byClient.reduce((s, c) => s + c.count, 0);
  const filename = incomeSummaryFilename(periodLabel, header.businessName, detailed);
  const invoiceLabel = (n: number | null) => (n != null ? formatDocNumber('invoice', n) : '—');

  if (!detailed) {
    return renderToPdf(
      <IncomeSummaryTemplate
        d={{
          ...header,
          clients: income.byClient.map((c) => ({
            client: c.client,
            count: c.count,
            total: c.total,
            payments: c.payments.map((p) => ({
              date: p.day ? prettyDate(p.day) : '—',
              invoice: invoiceLabel(p.invoiceNumber),
              method: p.method,
              amount: p.amount,
            })),
          })),
          total: income.broughtIn,
          count,
        }}
        accent={accent}
      />,
      filename,
    );
  }

  // Detailed: each payment's invoice and its line items, plus where the payment
  // sits in the invoice's full installment history ("Payment 2 of INV-0042").
  const byPaymentId = new Map(payRows.map((r) => [r.id as string, r]));
  const invoiceIds = [...new Set(payRows.map((r) => r.invoice_id as string))];
  const history = new Map<string, string[]>(); // invoice_id → payment ids, oldest first
  for (const r of await source.paymentHistory(invoiceIds)) {
    const key = r.invoice_id as string;
    const list = history.get(key);
    if (list) list.push(r.id as string); else history.set(key, [r.id as string]);
  }

  const itemsListed = new Set<string>(); // invoices whose items are already in the document
  const clients = income.byClient.map((c) => ({
    client: c.client,
    count: c.count,
    total: c.total,
    payments: c.payments.map((p): IncomeDetailPayment => {
      const row = p.id ? byPaymentId.get(p.id) : undefined;
      const invoiceId = (row?.invoice_id as string | undefined) ?? '';
      const invoice = invoiceLabel(p.invoiceNumber);
      const base = { date: p.day ? prettyDate(p.day) : '—', invoice, method: p.method, amount: p.amount };
      if (!row) return base;

      const ids = history.get(invoiceId) ?? [];
      const ordinal = ids.indexOf(p.id as string) + 1;
      const showItems = !itemsListed.has(invoiceId);
      itemsListed.add(invoiceId);
      const of = p.invoiceNumber != null ? invoice : 'this invoice';
      const note = ids.length > 1 && ordinal > 0
        ? `Payment ${ordinal} of ${of}${showItems ? '' : ' · items listed above'}`
        : null;
      if (!showItems) return { ...base, note };

      const raw = embedded(row)?.line_items;
      const all: IncomeLineItem[] = (Array.isArray(raw) ? raw : []).map((li: { description?: unknown; qty?: unknown; unit_price?: unknown }) => {
        const qty = num(li?.qty);
        const unitPrice = num(li?.unit_price);
        return { description: String(li?.description ?? ''), qty, unitPrice, amount: calculateLineAmount(qty, unitPrice) };
      });
      return {
        ...base,
        note,
        items: all.slice(0, MAX_LINE_ITEMS),
        moreItems: Math.max(0, all.length - MAX_LINE_ITEMS),
      };
    }),
  }));

  return renderToPdf(
    <IncomeDetailedTemplate d={{ ...header, clients, total: income.broughtIn, count }} accent={accent} />,
    filename,
  );
}

/** The database source: the session client, so RLS scopes every row to the
 *  signed-in user. */
export function supabaseSource(): SummaryPdfSource {
  const supabase = createClient();
  return {
    async profile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('signed out');
      const { data, error } = await supabase
        .from('profiles')
        .select('business_name, logo_url, brand_colors, background_color')
        .eq('id', user.id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('no profile');
      return data as SummaryPdfProfile;
    },
    expenses(range, detailed) {
      return fetchAll((from, to) => supabase
        .from('expenses')
        .select(detailed
          ? 'id, amount, category, tax_deductible, spent_on, description, vendor, note, receipt_path, receipt_url'
          : 'id, amount, category, tax_deductible, spent_on')
        .is('deleted_at', null)
        .gte('spent_on', range.start)
        .lte('spent_on', range.end)
        .order('spent_on', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to));
    },
    payments(range, detailed) {
      const invoiceCols = detailed
        ? 'client_name, invoice_number, kind, deleted_at, line_items'
        : 'client_name, invoice_number, kind, deleted_at';
      return fetchAll((from, to) => supabase
        .from('invoice_payments')
        .select(`id, invoice_id, amount, paid_at, method, stripe_checkout_session_id, invoices!inner(${invoiceCols})`)
        .eq('invoices.kind', 'invoice')
        .is('invoices.deleted_at', null)
        .gte('paid_at', localMidnight(range.start))
        .lt('paid_at', localMidnight(range.end, 1))
        .order('paid_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to));
    },
    async paymentHistory(invoiceIds) {
      const out: Row[] = [];
      for (let i = 0; i < invoiceIds.length; i += 100) {
        const chunk = invoiceIds.slice(i, i + 100);
        out.push(...await fetchAll((from, to) => supabase
          .from('invoice_payments')
          .select('id, invoice_id')
          .in('invoice_id', chunk)
          .order('paid_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)));
      }
      return out;
    },
  };
}

/** Mount the document offscreen (794px, outside the viewport), let it paint,
 *  capture it, and tear it down again whatever happens. */
async function renderToPdf(doc: ReactElement, filename: string): Promise<File> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-9999px';
  host.style.top = '0px';
  const target = document.createElement('div');
  host.appendChild(target);
  document.body.appendChild(host);
  const root = createRoot(target);
  try {
    flushSync(() => root.render(doc));
    await new Promise((r) => setTimeout(r, 350)); // let the document paint
    return await elementToPdf(target, filename);
  } finally {
    root.unmount();
    host.remove();
  }
}

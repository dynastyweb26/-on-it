'use client';
// ═══ Summary PDF builder ═══ One entry point for every books export: expenses
// or income, totals or itemized, over any local date range. It loads its own
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
import { formatDocNumber } from '@/lib/documents';
import { summarize, summarizeIncome, type ExpenseLite, type PaymentLite } from '@/lib/tax-summary';
import { elementToPdf, summaryFilename, incomeSummaryFilename } from '@/lib/pdf/generate';
import {
  ExpenseTotalsTemplate, IncomeItemizedTemplate, ExpenseItemizedTemplate, IncomeTotalsTemplate,
  type ExpenseDetailCategory,
} from '@/lib/pdf/summary-template';

export type SummaryPdfKind = 'expenses' | 'income';
// 'totals' = the period rolled up (expenses by category, income by client);
// 'itemized' = every expense / every payment, grouped the same way.
export type SummaryPdfDetail = 'totals' | 'itemized';

export interface SummaryPdfOptions {
  kind: SummaryPdfKind;
  detail: SummaryPdfDetail;
  range: { start: string; end: string }; // local yyyy-mm-dd, inclusive
  periodLabel: string;                   // literal label on the document, never "This Month"
}

// PostgREST caps a response (1000 rows on Supabase), so long periods are read
// in pages. Each query orders on a unique tail so pages never overlap.
const PAGE_ROWS = 1000;
// Capture resolution for every books PDF (invoices stay at elementToPdf's 3×).
// White paper and black text stay crisp at 2×, and a long detailed statement
// builds faster and lighter — fewer pixels per page for iOS Safari's canvas
// memory limit.
const SUMMARY_CAPTURE_SCALE = 2;

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
  expenses(range: SummaryPdfOptions['range'], itemized: boolean): Promise<Row[]>;
  /** Payments on non-deleted invoices of kind 'invoice', paid_at on a local day
   *  in range, oldest first; the invoice embedded as `invoices`. */
  payments(range: SummaryPdfOptions['range']): Promise<Row[]>;
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
  const itemized = detail === 'itemized';

  if (kind === 'expenses') {
    const rows = await source.expenses(range, itemized);
    const summary = summarize(rows as unknown as ExpenseLite[]);
    const filename = summaryFilename(periodLabel, header.businessName, itemized);

    if (!itemized) {
      return renderToPdf(
        <ExpenseTotalsTemplate
          d={{
            ...header,
            rows: summary.rows.map((r) => ({ label: r.label, count: r.count, total: r.total })),
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
        // What was bought: the saved description (the receipt reader writes a
        // short phrase since this branch); older rows have none, so they show
        // their category instead of a blank.
        const what = String(r.description ?? '').trim() || s.label;
        const note = String(r.note ?? '').trim();
        const vendor = String(r.vendor ?? '').trim();
        return {
          date: r.spent_on ? prettyDate(String(r.spent_on)) : '—',
          store: vendor || '—',
          description: note ? `${what} — ${note}` : what,
          amount: num(r.amount),
          hasReceipt: Boolean(r.receipt_url || r.receipt_path),
        };
      }),
    }));

    return renderToPdf(
      <ExpenseItemizedTemplate d={{ ...header, categories, total: summary.total, count: summary.count }} accent={accent} />,
      filename,
    );
  }

  // ── Income: the payments ledger, cash basis, invoices only (never quotes),
  // soft-deleted invoices excluded — the same filter the Summary screen uses.
  const payRows = await source.payments(range);

  // Supabase embeds a to-one relation as an object (older shapes: an array);
  // handle both so client_name resolves either way.
  type Emb = { client_name?: string; invoice_number?: number | null };
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
      entry_type: (r.entry_type as string | null) ?? null,
      invoice_number: inv?.invoice_number ?? null,
    };
  });
  // The query already holds the range, so the rollup runs unbounded over it.
  const income = summarizeIncome(payments, [], {
    id: 'range', granularity: 'all', label: periodLabel, friendlyLabel: periodLabel, start: range.start, end: range.end,
  });
  const count = income.byClient.reduce((s, c) => s + c.count, 0);
  const filename = incomeSummaryFilename(periodLabel, header.businessName, itemized);
  const invoiceLabel = (n: number | null) => (n != null ? formatDocNumber('invoice', n) : '—');

  if (!itemized) {
    // Totals: one row per client (count + amount), then the grand total.
    return renderToPdf(
      <IncomeTotalsTemplate
        d={{
          ...header,
          clients: income.byClient.map((c) => ({ client: c.client, count: c.count, total: c.total })),
          total: income.broughtIn,
          count,
        }}
        accent={accent}
      />,
      filename,
    );
  }

  // Itemized: every payment, grouped by client — date paid, invoice #, method,
  // amount, with client subtotals.
  return renderToPdf(
    <IncomeItemizedTemplate
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
    expenses(range, itemized) {
      return fetchAll((from, to) => supabase
        .from('expenses')
        .select(itemized
          ? 'id, amount, category, spent_on, description, vendor, note, receipt_path, receipt_url'
          : 'id, amount, category, spent_on')
        .is('deleted_at', null)
        .gte('spent_on', range.start)
        .lte('spent_on', range.end)
        .order('spent_on', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to));
    },
    payments(range) {
      const invoiceCols = 'client_name, invoice_number, kind, deleted_at';
      return fetchAll((from, to) => supabase
        .from('invoice_payments')
        .select(`id, invoice_id, amount, paid_at, method, entry_type, stripe_checkout_session_id, invoices!inner(${invoiceCols})`)
        .eq('invoices.kind', 'invoice')
        .is('invoices.deleted_at', null)
        .gte('paid_at', localMidnight(range.start))
        .lt('paid_at', localMidnight(range.end, 1))
        .order('paid_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to));
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
    return await elementToPdf(target, filename, { scale: SUMMARY_CAPTURE_SCALE });
  } finally {
    root.unmount();
    host.remove();
  }
}

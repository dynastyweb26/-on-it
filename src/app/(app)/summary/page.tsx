'use client';
// ═══ Books summary ═══ Money in (cash basis), money out, what's kept, and what
// is still owed — for a chosen period. In-app view follows the Warm Premium
// standard; the PDF exports are separate white/black documents built by
// buildSummaryPdf (lib/pdf/build-summary), which loads its own data.
//
// Period selection is a granularity (week/month/quarter/year) plus a specific
// bucket, chosen through a two-step sheet. Expenses and invoices are each
// fetched once and filtered client-side, so switching periods is instant and
// the period list is data-driven — only buckets that hold records are offered.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import PaywallModal from '@/components/PaywallModal';
import type { IconName } from '@/components/icon-names';
import { createClient } from '@/lib/supabase/client';
import {
  GRANULARITY_OPTIONS, availablePeriods, allPeriod, summarize,
  summarizeIncome, localDay,
  type Granularity, type Period, type ExpenseLite, type InvoiceLite, type PaymentLite, type ClientTotal,
} from '@/lib/tax-summary';
import { shareInvoice } from '@/lib/pdf/generate';
import { DISCLAIMER } from '@/lib/pdf/summary-template';
import { buildSummaryPdf, type SummaryPdfKind, type SummaryPdfDetail } from '@/lib/pdf/build-summary';

// Long lists show this many rows, then a "See all N →" row that expands in
// place (no nested scroll area).
const PREVIEW_ROWS = 5;

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

/** yyyy-mm-dd → "Jan 1, 2026" (local, no UTC day-shift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Profile {
  business_name: string;
}

const GRAN_LABEL: Record<Granularity, string> = { week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };

export default function TaxSummary() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [expenses, setExpenses] = useState<ExpenseLite[] | null>(null); // null = loading
  const [payments, setPayments] = useState<PaymentLite[] | null>(null); // income, cash basis
  const [owed, setOwed] = useState<InvoiceLite[] | null>(null);         // sent/overdue, as-of-now
  const [selected, setSelected] = useState<Period | null>(null);
  const [exporting, setExporting] = useState<SummaryPdfKind | null>(null);
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const [showAllIncome, setShowAllIncome] = useState(false);

  // Period sheet: open flag + which view (the granularity chooser, or one
  // granularity's list of specific periods).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<'root' | Granularity>('root');
  // PDF sheet: which export's Totals / Itemized choice is open.
  const [pdfSheet, setPdfSheet] = useState<SummaryPdfKind | null>(null);
  // Reports are paid-only while the paywall is on (hasAccess().canExport). null
  // until known: the buttons then behave as before (fail open).
  const [canExport, setCanExport] = useState<boolean | null>(null);
  const [reportsWall, setReportsWall] = useState(false);
  useEffect(() => {
    fetch('/api/access')
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => { if (a && typeof a.canExport === 'boolean') setCanExport(a.canExport); })
      .catch(() => { /* unknown → fail open */ });
  }, []);
  /** An export tap: the Totals / Itemized sheet, or the reports wall. */
  function openExport(kind: SummaryPdfKind) {
    if (canExport === false) { setReportsWall(true); return; }
    setPdfSheet(kind);
  }

  useEffect(() => {
    (async () => {
      // Fast local gate first: getSession() reads the persisted session with no
      // network round-trip, so a signed-out user is redirected instantly and the
      // decision can't hang on a stalled getUser() — the same fix as settings
      // (09dcc22). This page is worse off without it: there's no stall timeout.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data } = await supabase
        .from('profiles')
        .select('business_name')
        .eq('id', user.id).maybeSingle();
      if (data) setProfile(data as Profile);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch expenses, the payments ledger (income, cash basis), and the currently
  // outstanding invoices once; period switching is a client-side filter from
  // here. Income comes from invoice_payments bucketed by paid_at; outstanding is
  // a live snapshot of sent/overdue invoices. Quotes and soft-deleted invoices
  // are excluded on both.
  useEffect(() => {
    (async () => {
      const [exp, pay, owe] = await Promise.all([
        supabase.from('expenses').select('amount, category, spent_on').is('deleted_at', null),
        supabase.from('invoice_payments')
          .select('amount, paid_at, method, stripe_checkout_session_id, invoices!inner(client_name, invoice_number, kind, deleted_at)')
          .eq('invoices.kind', 'invoice')
          .is('invoices.deleted_at', null),
        supabase.from('invoices')
          .select('total, amount_paid, status')
          .is('deleted_at', null)
          .eq('kind', 'invoice')
          .in('status', ['sent', 'overdue']),
      ]);
      const eRows = (exp.data ?? []) as ExpenseLite[];
      // Supabase embeds a to-one relation as an object (older shapes: an array);
      // handle both so client_name resolves either way.
      type Emb = { client_name?: string; invoice_number?: number | null };
      const pRows: PaymentLite[] = ((pay.data ?? []) as Array<Record<string, unknown>>).map((r) => {
        const emb = r.invoices as Emb | Emb[] | null;
        const inv = Array.isArray(emb) ? emb[0] : emb;
        return {
          amount: r.amount as number | string,
          paid_at: (r.paid_at as string | null) ?? null,
          client_name: inv?.client_name ?? 'Client',
          method: (r.method as string | null) ?? null,
          via_stripe: Boolean(r.stripe_checkout_session_id),
          invoice_number: inv?.invoice_number ?? null,
        };
      });
      const oRows = (owe.data ?? []) as InvoiceLite[];
      setExpenses(eRows);
      setPayments(pRows);
      setOwed(oRows);
      // Data-driven periods span expenses (spent_on) and income (payment paid_at).
      const recordDates = [
        ...eRows.map((r) => r.spent_on ?? ''),
        ...pRows.map((p) => localDay(p.paid_at)),
      ].filter(Boolean);
      // Default to the most recent year that has records (the year-to-date
      // view), or all-time when there's nothing yet. ?period=all
      // (the Books Net / Collected tiles) opens at All time, where Kept and
      // Brought in equal the all-time figures the tiles show.
      const wantAll = new URLSearchParams(window.location.search).get('period') === 'all';
      setSelected(wantAll
        ? allPeriod(recordDates)
        : availablePeriods('year', recordDates)[0] ?? allPeriod(recordDates));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dates = useMemo(() => [
    ...(expenses ?? []).map((e) => e.spent_on ?? ''),
    ...(payments ?? []).map((p) => localDay(p.paid_at)),
  ].filter(Boolean), [expenses, payments]);

  const sheetPeriods = useMemo(
    () => (sheetView === 'root' ? [] : availablePeriods(sheetView, dates)),
    [sheetView, dates]
  );

  const inPeriod = useCallback((e: ExpenseLite) => {
    if (!selected || selected.granularity === 'all') return true;
    const on = e.spent_on ?? '';
    return on >= selected.start && on <= selected.end;
  }, [selected]);

  const summary = useMemo(
    () => summarize((expenses ?? []).filter(inPeriod)),
    [expenses, inPeriod]
  );

  const income = useMemo(
    () => (selected
      ? summarizeIncome(payments ?? [], owed ?? [], selected)
      : { broughtIn: 0, stillOwed: 0, byClient: [] as ClientTotal[] }),
    [payments, owed, selected]
  );

  const kept = income.broughtIn - summary.total;
  const hasData = summary.count > 0 || income.broughtIn > 0 || income.stillOwed > 0;

  // Sheets: body scroll lock + Escape to dismiss (matches PaywallModal).
  const anySheetOpen = sheetOpen || pdfSheet !== null;
  useEffect(() => {
    if (!anySheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSheetOpen(false); setPdfSheet(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [anySheetOpen]);

  function openSheet() { setSheetView('root'); setSheetOpen(true); }
  function pick(p: Period) { setSelected(p); setSheetOpen(false); }

  const incomeCount = income.byClient.reduce((s, c) => s + c.count, 0);

  function pickDetail(detail: SummaryPdfDetail) {
    const kind = pdfSheet;
    setPdfSheet(null);
    if (kind) exportPdf(kind, detail);
  }

  // Every PDF goes through the one builder (it loads its own rows for the
  // period), then the native share sheet. Disabled when that side is empty.
  async function exportPdf(kind: SummaryPdfKind, detail: SummaryPdfDetail = 'totals') {
    if (!profile || !selected || exporting) return;
    if (kind === 'expenses' ? summary.count === 0 : incomeCount === 0) return;
    setExporting(kind);
    try {
      const file = await buildSummaryPdf({
        kind,
        detail,
        range: { start: selected.start, end: selected.end },
        periodLabel: selected.label, // literal label on the document, never "This Month"
      });
      const noun = kind === 'expenses' ? 'Expense' : 'Income';
      await shareInvoice(file, profile.business_name, detail === 'itemized' ? `Itemized ${noun.toLowerCase()}` : `${noun} summary`);
    } catch {
      /* build/share/download failed — the button re-enables so they can retry */
    } finally {
      setExporting(null);
    }
  }

  const loading = expenses === null || payments === null || owed === null || selected === null;

  // #income (the Books Collected tile): the section only exists once data has
  // loaded, after the router's own hash handling has run, so scroll to it here,
  // once. It scrolls the shell's <main> (the page itself never scrolls).
  const incomeRef = useRef<HTMLElement>(null);
  const scrolledToHash = useRef(false);
  useEffect(() => {
    if (loading || scrolledToHash.current || window.location.hash !== '#income') return;
    scrolledToHash.current = true;
    incomeRef.current?.scrollIntoView({ block: 'start' });
  }, [loading]);

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">Books summary</h1>

      {/* Period selector — full-width trigger; taps open the two-step sheet. */}
      <button
        className="flex w-full items-center justify-between rounded-input border border-outline-variant bg-surface-container-lowest px-4 py-3 text-left active:scale-[0.99] transition-transform disabled:opacity-40"
        aria-haspopup="dialog"
        disabled={loading}
        onClick={openSheet}
      >
        <span className="font-semibold text-on-background">{selected?.friendlyLabel ?? 'All time'}</span>
        <Icon name="expand_more" size={22} className="text-on-surface-variant" />
      </button>

      {/* Two exports for the selected period, right under the period they
          cover. Each opens a sheet to pick Totals (expenses by category, income
          by client) or Itemized (every expense, every payment). Each is
          disabled when its side of the period is empty. */}
      {!loading && hasData && (
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-primary px-3" disabled={exporting !== null || summary.count === 0} aria-haspopup="dialog" onClick={() => openExport('expenses')}>
            <Icon name="download" size={20} /> {exporting === 'expenses' ? 'Building…' : 'Expenses PDF'}
          </button>
          <button className="btn-primary px-3" disabled={exporting !== null || incomeCount === 0} aria-haspopup="dialog" onClick={() => openExport('income')}>
            <Icon name="download" size={20} /> {exporting === 'income' ? 'Building…' : 'Income PDF'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-16 text-center text-on-surface-variant">Adding it up…</p>
      ) : !hasData ? (
        // Empty state — an invitation, never a $0 table.
        <div className="mt-14 text-center">
          <Icon name="receipt_long" size={44} className="text-primary" />
          <p className="mt-3 text-body-lg font-semibold text-on-background">Nothing logged for {selected.friendlyLabel} yet</p>
          <p className="mx-auto mt-1 max-w-xs text-body-md text-on-surface-variant">
            Snap a receipt in Chat, or say &ldquo;spent 45 on gas at Shell&rdquo; — it&apos;ll show up here, sorted by category.
          </p>
          <button className="btn-primary mt-5" onClick={() => router.push('/chat')}>
            <Icon name="photo_camera" size={20} /> Capture a receipt
          </button>
        </div>
      ) : (
        <>
          {/* Hero — four figures. Kept (income minus expenses) leads; Brought in
              and Spent compose it; Still owed is set apart and never in the net. */}
          <div className="space-y-4 rounded-card bg-inverse-surface p-6 shadow-card-raised">
            <div>
              <div className="text-label-lg font-semibold uppercase tracking-widest text-inverse-primary/80">
                Kept · {selected.friendlyLabel}
              </div>
              <div className="font-display text-numeric-xl tracking-tight text-inverse-primary">{money(kept)}</div>
              <div className="mt-1 text-xs text-inverse-on-surface/60">
                {summary.count} {summary.count === 1 ? 'expense' : 'expenses'} · {prettyDate(selected.start)} – {prettyDate(selected.end)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-inverse-on-surface/15 pt-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-inverse-on-surface/60">Brought in</div>
                <div className="font-display text-xl font-bold text-inverse-on-surface">{money(income.broughtIn)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-inverse-on-surface/60">Spent</div>
                <div className="font-display text-xl font-bold text-inverse-on-surface">{money(summary.total)}</div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-inverse-on-surface/15 pt-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-inverse-on-surface/60">Still owed (as of today)</div>
                <div className="text-[11px] text-inverse-on-surface/40">Not counted in kept</div>
              </div>
              <div className="font-display text-xl font-bold text-inverse-primary/90">{money(income.stillOwed)}</div>
            </div>
          </div>

          {/* Breakdown — stacked blocks, each with its own heading. Rendered only
              when it has rows, so a period with just one side shows just that. */}
          {summary.rows.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-baseline justify-between px-1 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
                <span>Expenses by category</span>
                <span className="font-display normal-case tracking-normal text-on-background">{money(summary.total)}</span>
              </h2>
              <div className="card divide-y divide-outline-variant/40 p-0">
                {(showAllExpenses ? summary.rows : summary.rows.slice(0, PREVIEW_ROWS)).map((r) => (
                  <div key={r.category} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div className="font-medium text-on-background">{r.label}</div>
                      <div className="text-xs text-on-surface-variant">
                        {r.count} {r.count === 1 ? 'expense' : 'expenses'}
                      </div>
                    </div>
                    <div className="font-display font-bold text-on-background">{money(r.total)}</div>
                  </div>
                ))}
                <SeeAllRow total={summary.rows.length} expanded={showAllExpenses} onToggle={() => setShowAllExpenses((v) => !v)} />
              </div>
            </section>
          )}

          {income.byClient.length > 0 && (
            <section id="income" ref={incomeRef} className="scroll-mt-4 space-y-2">
              <h2 className="flex items-baseline justify-between px-1 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
                <span>Income by client</span>
                <span className="font-display normal-case tracking-normal text-on-background">{money(income.broughtIn)}</span>
              </h2>
              <div className="card divide-y divide-outline-variant/40 p-0">
                {(showAllIncome ? income.byClient : income.byClient.slice(0, PREVIEW_ROWS)).map((c) => (
                  <div key={c.client} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-on-background">{c.client}</div>
                      <div className="text-xs text-on-surface-variant">
                        {c.count} {c.count === 1 ? 'payment received' : 'payments received'}
                      </div>
                    </div>
                    <div className="font-display font-bold text-on-background">{money(c.total)}</div>
                  </div>
                ))}
                <SeeAllRow total={income.byClient.length} expanded={showAllIncome} onToggle={() => setShowAllIncome((v) => !v)} />
              </div>
            </section>
          )}


          <p className="px-1 text-xs leading-relaxed text-on-surface-variant/80">{DISCLAIMER}</p>
        </>
      )}

      {/* Period sheet: step one (granularity) → step two (specific periods). */}
      {sheetOpen && selected && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-on-background/45"
          onClick={() => setSheetOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose a period"
            className="w-full max-w-lg rounded-t-card bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
            style={{ animation: 'paywall-in 200ms ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {sheetView === 'root' ? (
              <>
                <div className="mb-2 px-1 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">Period</div>
                <button
                  className="flex w-full items-center justify-between rounded-input px-3 py-3 text-left active:bg-surface-container transition-colors"
                  onClick={() => pick(allPeriod(dates))}
                >
                  <span className="font-semibold text-on-background">All</span>
                  {selected.granularity === 'all' && <Icon name="check" size={20} className="text-primary" />}
                </button>
                <div className="my-1 border-t border-outline-variant/40" />
                {GRANULARITY_OPTIONS.map(({ g, label }) => (
                  <button
                    key={g}
                    className="flex w-full items-center justify-between rounded-input px-3 py-3 text-left active:bg-surface-container transition-colors"
                    onClick={() => setSheetView(g)}
                  >
                    <span className="text-on-background">{label}</span>
                    <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-1">
                  <button
                    aria-label="Back"
                    className="grid h-11 w-11 place-items-center rounded-full text-on-surface-variant active:scale-90 transition-transform"
                    onClick={() => setSheetView('root')}
                  >
                    <Icon name="arrow_back" size={22} />
                  </button>
                  <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">{GRAN_LABEL[sheetView]}</span>
                </div>
                <div className="max-h-[50vh] overflow-y-auto">
                  {sheetPeriods.length === 0 ? (
                    <p className="px-1 py-6 text-center text-on-surface-variant">Nothing logged yet.</p>
                  ) : sheetPeriods.map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full items-center justify-between rounded-input px-3 py-3 text-left active:bg-surface-container transition-colors"
                      onClick={() => pick(p)}
                    >
                      <span className="text-on-background">{p.friendlyLabel}</span>
                      {selected.id === p.id && <Icon name="check" size={20} className="text-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}


      {/* PDF sheet: same bottom-sheet pattern as the period picker. */}
      {pdfSheet && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-on-background/45"
          onClick={() => setPdfSheet(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pdfSheet === 'expenses' ? 'Expenses PDF' : 'Income PDF'}
            className="w-full max-w-lg rounded-t-card bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-card-raised"
            style={{ animation: 'paywall-in 200ms ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 px-1 text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
              {pdfSheet === 'expenses' ? 'Expenses PDF' : 'Income PDF'}
            </div>
            <PdfOption
              icon="description"
              title="Totals"
              detail={pdfSheet === 'expenses' ? 'Totals by category' : 'Totals by client'}
              onClick={() => pickDetail('totals')}
            />
            <div className="my-1 border-t border-outline-variant/40" />
            <PdfOption
              icon="receipt_long"
              title="Itemized"
              detail={pdfSheet === 'expenses'
                ? 'Every expense with date, store and amount'
                : 'Every payment with date, invoice and amount'}
              onClick={() => pickDetail('itemized')}
            />
          </div>
        </div>
      )}
      {reportsWall && <PaywallModal variant="reports" onClose={() => setReportsWall(false)} />}
    </div>
  );
}

// "See all N →" / "Show less" — the last row of a long list, expanding it in
// place. Renders nothing when the list already fits in the preview.
function SeeAllRow({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
  if (total <= PREVIEW_ROWS) return null;
  return (
    <button
      className="flex min-h-touch w-full items-center justify-between px-4 py-3 text-left font-semibold text-primary active:bg-surface-container transition-colors"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span>{expanded ? 'Show less' : `See all ${total}`}</span>
      {/* expand_more flipped: expand_less isn't in the icon subset font */}
      <Icon name={expanded ? 'expand_more' : 'arrow_forward'} size={20} className={expanded ? 'rotate-180' : ''} />
    </button>
  );
}

// One choice in the PDF sheet: icon, title, and what the document contains.
function PdfOption({ icon, title, detail, onClick }: { icon: IconName; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      className="flex min-h-touch w-full items-center gap-3 rounded-input px-3 py-3 text-left active:bg-surface-container transition-colors"
      onClick={onClick}
    >
      <Icon name={icon} size={24} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-on-background">{title}</span>
        <span className="block text-xs text-on-surface-variant">{detail}</span>
      </span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-on-surface-variant" />
    </button>
  );
}

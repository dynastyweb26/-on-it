'use client';
// ═══ Tax summary ═══ A record of logged expenses by category, for a period.
// In-app view follows the Warm Premium standard; the PDF export is a separate
// white/black document (summary-template.tsx).
//
// Period selection is a granularity (week/month/quarter/year) plus a specific
// bucket, chosen through a two-step sheet. Every expense is fetched once and
// filtered client-side, so switching periods is instant and the period list can
// be data-driven — only buckets that actually hold records are offered.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { accentForWhite } from '@/lib/colors';
import {
  GRANULARITY_OPTIONS, availablePeriods, allPeriod, summarize,
  type Granularity, type Period, type ExpenseLite,
} from '@/lib/tax-summary';
import { elementToPdf, summaryFilename, shareInvoice } from '@/lib/pdf/generate';
import { ExpenseSummaryTemplate, DISCLAIMER, type ExpenseSummaryData } from '@/lib/pdf/summary-template';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** yyyy-mm-dd → "Jan 1, 2026" (local, no UTC day-shift). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Profile {
  business_name: string;
  logo_url: string | null;
  brand_colors: string[] | null;
  background_color: string | null;
}

const GRAN_LABEL: Record<Granularity, string> = { week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };

export default function TaxSummary() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [expenses, setExpenses] = useState<ExpenseLite[] | null>(null); // null = loading
  const [selected, setSelected] = useState<Period | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<ExpenseSummaryData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Period sheet: open flag + which view (the granularity chooser, or one
  // granularity's list of specific periods).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<'root' | Granularity>('root');

  const accent = useMemo(
    () => accentForWhite(profile?.brand_colors, profile?.background_color ?? null),
    [profile]
  );

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
        .select('business_name, logo_url, brand_colors, background_color')
        .eq('id', user.id).maybeSingle();
      if (data) setProfile(data as Profile);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch every expense once; period switching is a client-side filter from here.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('expenses')
        .select('amount, category, tax_deductible, spent_on');
      const rows = (data ?? []) as ExpenseLite[];
      setExpenses(rows);
      const dates = rows.map((r) => r.spent_on ?? '').filter(Boolean);
      // Default to the most recent year that has records (the tax-relevant
      // year-to-date view), or all-time when there's nothing yet.
      setSelected(availablePeriods('year', dates)[0] ?? allPeriod(dates));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dates = useMemo(() => (expenses ?? []).map((e) => e.spent_on ?? '').filter(Boolean), [expenses]);

  // Only the current sheet view's periods, data-driven and most-recent-first.
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

  // Sheet: body scroll lock + Escape to dismiss (matches PaywallModal).
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [sheetOpen]);

  function openSheet() { setSheetView('root'); setSheetOpen(true); }
  function pick(p: Period) { setSelected(p); setSheetOpen(false); }

  async function exportPdf() {
    if (!profile || !selected || exporting || summary.count === 0) return;
    setExporting(true);
    try {
      setExportData({
        businessName: profile.business_name,
        logoUrl: profile.logo_url,
        periodLabel: selected.label, // literal label on the document, never "This Month"
        rangeStart: prettyDate(selected.start),
        rangeEnd: prettyDate(selected.end),
        generatedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        rows: summary.rows.map((r) => ({ label: r.label, count: r.count, total: r.total, anyDeductible: r.anyDeductible })),
        total: summary.total,
        count: summary.count,
      });
      await new Promise((r) => setTimeout(r, 350)); // let the document paint
      if (!printRef.current) throw new Error('render failed');
      const file = await elementToPdf(printRef.current, summaryFilename(selected.label, profile.business_name));
      await shareInvoice(file, profile.business_name);
    } catch {
      /* share/download failed — the button re-enables so they can retry */
    } finally {
      setExportData(null);
      setExporting(false);
    }
  }

  const loading = expenses === null || selected === null;

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">Expense summary</h1>

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

      {loading ? (
        <p className="mt-16 text-center text-on-surface-variant">Adding it up…</p>
      ) : summary.count === 0 ? (
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
          {/* Total — the hero figure */}
          <div className="rounded-card bg-inverse-surface p-6 shadow-card-raised">
            <div className="text-label-lg font-semibold uppercase tracking-widest text-inverse-primary/80">
              Total spend · {selected.friendlyLabel}
            </div>
            <div className="font-display text-numeric-xl tracking-tight text-inverse-primary">
              {money(summary.total)}
            </div>
            <div className="mt-1 text-xs text-inverse-on-surface/60">
              {summary.count} {summary.count === 1 ? 'expense' : 'expenses'} · {prettyDate(selected.start)} – {prettyDate(selected.end)}
            </div>
          </div>

          {/* Category breakdown — sorted desc, zero categories omitted */}
          <div className="card divide-y divide-outline-variant/40 p-0">
            {summary.rows.map((r) => (
              <div key={r.category} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-on-background">{r.label}</div>
                  <div className="text-xs text-on-surface-variant">
                    {r.count} {r.count === 1 ? 'expense' : 'expenses'}
                    {r.anyDeductible && <span className="text-paid"> · some marked deductible</span>}
                  </div>
                </div>
                <div className="font-display font-bold text-on-background">{money(r.total)}</div>
              </div>
            ))}
          </div>

          <button className="btn-primary w-full" disabled={exporting} onClick={exportPdf}>
            <Icon name="download" size={20} /> {exporting ? 'Building your PDF…' : 'Export PDF'}
          </button>

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
                    className="grid h-9 w-9 place-items-center rounded-full text-on-surface-variant active:scale-90 transition-transform"
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

      {/* Offscreen render target for the white/black PDF document */}
      {exportData && (
        <div style={{ position: 'fixed', left: -9999, top: 0 }}>
          <div ref={printRef}>
            <ExpenseSummaryTemplate d={exportData} accent={accent} />
          </div>
        </div>
      )}
    </div>
  );
}

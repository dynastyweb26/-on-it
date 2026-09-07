'use client';
// ═══ Tax summary ═══ A record of logged expenses by category, for a period.
// In-app view follows the Warm Premium standard; the PDF export is a separate
// white/black document (summary-template.tsx).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';
import { accentForWhite } from '@/lib/colors';
import {
  PERIOD_OPTIONS, periodRange, summarize,
  type PeriodKey, type ExpenseLite,
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

export default function TaxSummary() {
  const supabase = createClient();
  const router = useRouter();
  const [period, setPeriod] = useState<PeriodKey>('this_year');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [expenses, setExpenses] = useState<ExpenseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportData, setExportData] = useState<ExpenseSummaryData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const summary = useMemo(() => summarize(expenses), [expenses]);
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

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('expenses')
      .select('amount, category, tax_deductible, spent_on')
      .gte('spent_on', range.start)
      .lte('spent_on', range.end);
    setExpenses((data ?? []) as ExpenseLite[]);
    setLoading(false);
  }, [supabase, range.start, range.end]);

  useEffect(() => { void loadExpenses(); }, [loadExpenses]);

  async function exportPdf() {
    if (!profile || exporting || summary.count === 0) return;
    setExporting(true);
    try {
      setExportData({
        businessName: profile.business_name,
        logoUrl: profile.logo_url,
        periodLabel: range.label,
        rangeStart: prettyDate(range.start),
        rangeEnd: prettyDate(range.end),
        generatedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        rows: summary.rows.map((r) => ({ label: r.label, count: r.count, total: r.total, anyDeductible: r.anyDeductible })),
        total: summary.total,
        count: summary.count,
      });
      await new Promise((r) => setTimeout(r, 350)); // let the document paint
      if (!printRef.current) throw new Error('render failed');
      const file = await elementToPdf(printRef.current, summaryFilename(range.label, profile.business_name));
      await shareInvoice(file, profile.business_name);
    } catch {
      /* share/download failed — the button re-enables so they can retry */
    } finally {
      setExportData(null);
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">Expense summary</h1>

      {/* Period toggle */}
      <div className="flex gap-2">
        {PERIOD_OPTIONS.map(({ key, tab }) => (
          <button
            key={key}
            className={`chip flex-1 ${period === key ? 'chip-selected' : ''}`}
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-16 text-center text-on-surface-variant">Adding it up…</p>
      ) : summary.count === 0 ? (
        // Empty state (item 7) — an invitation, never a $0 table.
        <div className="mt-14 text-center">
          <Icon name="receipt_long" size={44} className="text-primary" />
          <p className="mt-3 text-body-lg font-semibold text-on-background">Nothing logged for {range.label} yet</p>
          <p className="mx-auto mt-1 max-w-xs text-body-md text-on-surface-variant">
            Snap a receipt in Chat, or say &ldquo;spent 45 on gas at Shell&rdquo; — it&apos;ll show up here, sorted by category.
          </p>
          <button className="btn-primary mt-5" onClick={() => router.push('/chat')}>
            <Icon name="photo_camera" size={20} /> Capture a receipt
          </button>
        </div>
      ) : (
        <>
          {/* Total — the hero figure (§1) */}
          <div className="rounded-card bg-inverse-surface p-6 shadow-card-raised">
            <div className="text-label-lg font-semibold uppercase tracking-widest text-inverse-primary/80">
              Total spend · {range.label}
            </div>
            <div className="font-display text-numeric-xl tracking-tight text-inverse-primary">
              {money(summary.total)}
            </div>
            <div className="mt-1 text-xs text-inverse-on-surface/60">
              {summary.count} {summary.count === 1 ? 'expense' : 'expenses'} · {prettyDate(range.start)} – {prettyDate(range.end)}
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

          {/* Disclaimer on screen (item 5) */}
          <p className="px-1 text-xs leading-relaxed text-on-surface-variant/80">{DISCLAIMER}</p>
        </>
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

'use client';
// ═══ Recaps — the history list ═══ (RECAP-SPEC §0b, commit 14c)
// Books "See all": every weekly and monthly recap, newest first. Tapping a row
// plays it (useRecaps().open — sound unlocks inside the tap). Each row keeps
// the old recap sheet's Income / Expenses PDF buttons for its period (paid-
// only). Free / canceled owners see their rows locked: any tap opens the
// paywall (reports variant). Nothing here while RECAPS_LIVE is off.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import PaywallModal from '@/components/PaywallModal';
import PdfChoiceSheet from '@/components/PdfChoiceSheet';
import RecapMark from '@/components/recap/RecapMark';
import { useRecaps } from '@/components/recap/RecapProvider';
import { rowTitle } from '@/components/recap/RecapsCard';
import { money } from '@/components/recap/copy';
import { createClient } from '@/lib/supabase/client';
import { RECAPS_LIVE } from '@/lib/recaps-live';
import { bucketFor } from '@/lib/tax-summary';
import { shareInvoice } from '@/lib/pdf/generate';
import { buildSummaryPdf, type SummaryPdfDetail, type SummaryPdfKind } from '@/lib/pdf/build-summary';
import { RECAP_HISTORY_COLS, announces, normalizeRow, rowLabel, sortRows, type RecapRow } from '@/lib/recap/rows';

const MAX_ROWS = 200;   // ~4 years of weeks + months

export default function RecapsPage() {
  const router = useRouter();
  const { access, watched, open } = useRecaps();
  const [rows, setRows] = useState<RecapRow[] | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [paywall, setPaywall] = useState(false);
  const [pdf, setPdf] = useState<{ row: RecapRow; kind: SummaryPdfKind } | null>(null);
  const [building, setBuilding] = useState<string | null>(null);   // `${id}:${kind}`

  useEffect(() => { if (!RECAPS_LIVE || access === 'off') router.replace('/dashboard'); }, [access, router]);

  useEffect(() => {
    if (access !== 'open' && access !== 'locked') return;
    const supabase = createClient();
    let live = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data }, { data: prof }] = await Promise.all([
        supabase.from('recaps').select(RECAP_HISTORY_COLS).order('period_end', { ascending: false }).limit(MAX_ROWS),
        user ? supabase.from('profiles').select('business_name').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!live) return;
      setRows(sortRows(((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeRow)));
      setBusinessName((prof?.business_name as string | undefined) ?? '');
    })().catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [access]);

  const locked = access === 'locked';

  async function build(detail: SummaryPdfDetail) {
    const job = pdf;
    setPdf(null);
    if (!job || building) return;
    setBuilding(`${job.row.id}:${job.kind}`);
    try {
      const file = await buildSummaryPdf({
        kind: job.kind,
        detail,
        range: { start: job.row.period_start, end: job.row.period_end },
        // The Summary screen's label for this bucket ("Week of Sep 22",
        // "September 2026"), so the PDF title and filename match it.
        periodLabel: bucketFor(job.row.kind, job.row.period_start).label,
      });
      const noun = job.kind === 'expenses' ? 'Expense' : 'Income';
      await shareInvoice(file, businessName, detail === 'itemized' ? `Itemized ${noun.toLowerCase()}` : `${noun} summary`);
    } catch {
      /* build/share failed — the button re-enables so they can retry */
    } finally {
      setBuilding(null);
    }
  }

  return (
    <div className="space-y-3 px-4 py-4">
      <h1 className="font-display text-headline-mobile font-extrabold text-on-background">Recaps</h1>
      {rows === null ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="card h-[124px] animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex items-center gap-3">
          <RecapMark ring={false} />
          <span className="text-sm text-on-surface-variant">
            {locked ? 'Weekly and monthly recaps are part of On It.' : 'Your first recap lands Monday morning.'}
          </span>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const seen = !!r.seen_at || watched.has(r.id);
            const busy = (k: SummaryPdfKind) => building === `${r.id}:${k}`;
            return (
              <li key={r.id} className="card space-y-3">
                <button
                  className="flex w-full items-center gap-3 text-left"
                  aria-label={`${rowLabel(r)}: ${locked ? 'locked, see plans' : rowTitle(r, seen)}`}
                  onClick={() => (locked ? setPaywall(true) : open(r))}
                >
                  <RecapMark size={44} ring={!locked && !seen && announces(r)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                      {r.kind === 'month' ? 'Monthly' : 'Weekly'}
                    </span>
                    <span className="block truncate font-semibold text-on-background">{rowLabel(r)}</span>
                    <span className="block text-sm text-on-surface-variant tabular-nums">{money(r.income)} in · {money(r.expenses)} out</span>
                  </span>
                  <Icon name={locked ? 'lock' : 'play_arrow'} size={22} filled={!locked} className="shrink-0 text-on-surface-variant" />
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {(['income', 'expenses'] as const).map((k) => (
                    <button
                      key={k}
                      className="btn-outline whitespace-nowrap px-2 text-primary"
                      aria-haspopup="dialog"
                      disabled={!locked && (building !== null || (k === 'income' ? r.income : r.expenses) === 0)}
                      onClick={() => (locked ? setPaywall(true) : setPdf({ row: r, kind: k }))}
                    >
                      {busy(k) ? 'Building…' : k === 'income' ? 'Income PDF' : 'Expenses PDF'}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PdfChoiceSheet kind={pdf?.kind ?? null} onPick={build} onClose={() => setPdf(null)} />
      {paywall && <PaywallModal variant="reports" returnTo="books" onClose={() => setPaywall(false)} />}
    </div>
  );
}

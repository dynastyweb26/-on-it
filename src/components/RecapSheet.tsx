'use client';
// ═══ Recap sheet ═══ "Your week in review" — the in-app side of the weekly /
// monthly recap (snapshots built by the daily cron, lib/notify/recaps).
//
// When it opens (once per app open, never over the first-run tutorial):
//   • /dashboard?recap=<id> (the push tap) → that recap;
//   • otherwise the newest unseen recap from the last 14 days.
// Showing one quietly marks any older unseen recaps seen (no stack of
// popups); closing it stamps its seen_at (the only column clients may write).
// Never on /onboarding, /login or the public pay pages — those live outside
// the (app) layout that mounts this, and the path guard below repeats it.
//
// Motion (MOTION-SPEC §12): the sheet rises at --motion-slow; income →
// expenses → net count up 700ms each, 120ms apart; "Most spent on" and the
// buttons rise after net lands. Counted once per recap per session
// (sessionStorage, the Books pattern); reduced motion shows static values.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Icon from '@/components/Icon';
import CountUpMoney from '@/components/CountUpMoney';
import PdfChoiceSheet from '@/components/PdfChoiceSheet';
import { createClient } from '@/lib/supabase/client';
import { CATEGORY_LABEL, isExpenseCategory } from '@/lib/expenses';
import { bucketFor } from '@/lib/tax-summary';
import { shareInvoice } from '@/lib/pdf/generate';
import { buildSummaryPdf, type SummaryPdfKind, type SummaryPdfDetail } from '@/lib/pdf/build-summary';

export type Recap = {
  id: string;
  kind: 'week' | 'month';
  period_start: string;   // yyyy-mm-dd, inclusive
  period_end: string;
  income: number;
  expenses: number;
  net: number;
  payments_count: number;
  expenses_count: number;
  top_category: string | null;
  top_category_amount: number | null;
  top_vendor: string | null;
  created_at?: string;
  seen_at?: string | null;
};

const RECAP_COLS = 'id, kind, period_start, period_end, income, expenses, net, payments_count, expenses_count, top_category, top_category_amount, top_vendor, created_at, seen_at';
const WINDOW_MS = 14 * 24 * 3600e3;
const COUNTED_KEY = (id: string) => `onit_recap_counted:${id}`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HIDDEN_ON = ['/onboarding', '/login', '/pay'];

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';
// A negative net reads "−$120.00": a sign, never a colour (Books rule).
const signedMoney = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const ymdParts = (iso: string) => iso.split('-').map(Number) as [number, number, number];

/** "Week of Sep 22 – 28" (or "Sep 29 – Oct 5" across months) / "September 2026". */
export function recapEyebrow(r: Pick<Recap, 'kind' | 'period_start' | 'period_end'>): string {
  const [y, m, d] = ymdParts(r.period_start);
  if (r.kind === 'month') return `${MONTHS[m - 1]} ${y}`;
  const [, m2, d2] = ymdParts(r.period_end);
  const mon = (k: number) => MONTHS[k - 1].slice(0, 3);
  return m === m2 ? `Week of ${mon(m)} ${d} – ${d2}` : `Week of ${mon(m)} ${d} – ${mon(m2)} ${d2}`;
}

export function recapHeadline(r: Pick<Recap, 'kind' | 'period_start'>): string {
  return r.kind === 'week' ? 'Your week in review' : `Your ${MONTHS[ymdParts(r.period_start)[1] - 1]} in review`;
}

/** The container: finds which recap to show and owns seen_at. */
export default function RecapSheet({ suppressed = false }: { suppressed?: boolean }) {
  const pathname = usePathname();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [businessName, setBusinessName] = useState('');
  const checked = useRef(false); // one recap per app open

  useEffect(() => {
    if (checked.current || suppressed) return;
    if (HIDDEN_ON.some((p) => pathname?.startsWith(p))) return;
    checked.current = true;
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const wanted = new URLSearchParams(window.location.search).get('recap');
      let row: Recap | null = null;
      if (wanted && UUID_RE.test(wanted)) {
        const { data } = await supabase.from('recaps').select(RECAP_COLS).eq('id', wanted).maybeSingle();
        row = (data as Recap | null) ?? null;
      }
      if (!row) {
        const { data } = await supabase.from('recaps').select(RECAP_COLS)
          .is('seen_at', null)
          .gte('created_at', new Date(Date.now() - WINDOW_MS).toISOString())
          .order('created_at', { ascending: false })
          .limit(1);
        row = ((data as Recap[] | null) ?? [])[0] ?? null;
      }
      if (!row) return; // none, or the table isn't there yet (query error → no data)
      // Older unseen recaps are retired quietly: one popup per app open.
      if (row.created_at) {
        void supabase.from('recaps').update({ seen_at: new Date().toISOString() })
          .is('seen_at', null).lt('created_at', row.created_at).then(() => undefined);
      }
      const { data: prof } = await supabase.from('profiles').select('business_name').eq('id', user.id).maybeSingle();
      setBusinessName((prof?.business_name as string | undefined) ?? '');
      setRecap({ ...row, income: Number(row.income), expenses: Number(row.expenses), net: Number(row.net),
        top_category_amount: row.top_category_amount == null ? null : Number(row.top_category_amount) });
    })().catch(() => { /* best-effort: no recap this time */ });
  }, [pathname, suppressed]);

  function close() {
    const r = recap;
    setRecap(null);
    if (!r) return;
    // Drop ?recap= so a reload doesn't reopen it.
    const url = new URL(window.location.href);
    if (url.searchParams.has('recap')) {
      url.searchParams.delete('recap');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    if (!r.seen_at) {
      void createClient().from('recaps').update({ seen_at: new Date().toISOString() }).eq('id', r.id).then(() => undefined);
    }
  }

  if (!recap || suppressed) return null;
  return <RecapView recap={recap} businessName={businessName} onClose={close} />;
}

/** The sheet itself. Exported for the temporary /dev/recap-preview page. */
export function RecapView({ recap, businessName, onClose }: { recap: Recap; businessName: string; onClose: () => void }) {
  // Count up the first time this recap is shown in this session only.
  const [count] = useState(() => {
    try {
      if (sessionStorage.getItem(COUNTED_KEY(recap.id))) return false;
      sessionStorage.setItem(COUNTED_KEY(recap.id), '1');
      return true;
    } catch { return false; }
  });
  const [pdfKind, setPdfKind] = useState<SummaryPdfKind | null>(null);
  const [building, setBuilding] = useState<SummaryPdfKind | null>(null);

  // Scroll lock + Escape (closes the PDF choice first, then the sheet).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pdfKind) setPdfKind(null); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pdfKind, onClose]);

  async function build(detail: SummaryPdfDetail) {
    const kind = pdfKind;
    setPdfKind(null);
    if (!kind || building) return;
    setBuilding(kind);
    try {
      const file = await buildSummaryPdf({
        kind,
        detail,
        range: { start: recap.period_start, end: recap.period_end },
        // The Summary screen's literal label for this bucket ("Week of Sep 22",
        // "September 2026"), so the PDF title and filename match it.
        periodLabel: bucketFor(recap.kind, recap.period_start).label,
      });
      const noun = kind === 'expenses' ? 'Expense' : 'Income';
      await shareInvoice(file, businessName, detail === 'detailed' ? `${noun} detail` : `${noun} summary`);
    } catch {
      /* build/share failed — the button re-enables so they can retry */
    } finally {
      setBuilding(null);
    }
  }

  // Timeline: counts start as the sheet lands; net lands at 300 + 240 + 700ms;
  // the rows after it rise from there.
  const START = 300;
  const NET_LANDS = START + 240 + 700;
  const rise = (delay: number) => (count
    ? { cls: ' onit-rise', style: { animationDelay: `${delay}ms` } }
    : { cls: '', style: undefined });
  const topLabel = recap.top_category
    ? (isExpenseCategory(recap.top_category) ? CATEGORY_LABEL[recap.top_category] : recap.top_category)
    : null;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-on-background/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={recapHeadline(recap)}
        className="onit-sheet-in flex h-[calc(100dvh-max(12px,env(safe-area-inset-top)))] w-full max-w-lg flex-col rounded-t-card bg-background shadow-card-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto px-5 pt-6">
          <div className="text-label-lg font-semibold uppercase tracking-widest text-on-surface-variant">{recapEyebrow(recap)}</div>
          <h2 className="mt-1 font-display text-headline-mobile font-extrabold text-on-background">{recapHeadline(recap)}</h2>

          {/* Net leads: the large figure, uncoloured; income and expenses compose it. */}
          <div className="mt-6 space-y-4 rounded-card bg-inverse-surface p-6 shadow-card-raised">
            <div className="grid grid-cols-2 gap-4">
              <Figure label="Income" dot="bg-paid">
                <CountUpMoney value={recap.income} run={count} format={money} delayMs={START} durationMs={700} />
              </Figure>
              <Figure label="Expenses" dot="bg-outline">
                <CountUpMoney value={recap.expenses} run={count} format={money} delayMs={START + 120} durationMs={700} />
              </Figure>
            </div>
            <div className="border-t border-inverse-on-surface/15 pt-4">
              <div className="text-xs uppercase tracking-wide text-inverse-on-surface/60">Net</div>
              <div className="font-display text-numeric-xl tracking-tight text-inverse-on-surface tabular-nums">
                <CountUpMoney value={recap.net} run={count} format={signedMoney} delayMs={START + 240} durationMs={700} />
              </div>
            </div>
          </div>

          {recap.expenses > 0 && topLabel && (
            <div className={`card mt-4 p-4${rise(NET_LANDS).cls}`} style={rise(NET_LANDS).style}>
              <div className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Most spent on</div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-semibold text-on-background">{topLabel}</span>
                <span className="font-display font-bold text-on-background tabular-nums">{money(Number(recap.top_category_amount ?? 0))}</span>
              </div>
              {recap.top_vendor && <div className="mt-0.5 truncate text-sm text-on-surface-variant">mostly at {recap.top_vendor}</div>}
            </div>
          )}

          <p className={`mt-4 px-1 text-sm text-on-surface-variant${rise(NET_LANDS + 50).cls}`} style={rise(NET_LANDS + 50).style}>
            {plural(recap.payments_count, 'payment', 'payments')} · {plural(recap.expenses_count, 'expense', 'expenses')}
          </p>
        </div>

        <div className="space-y-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className={`grid grid-cols-2 gap-3${rise(NET_LANDS + 100).cls}`} style={rise(NET_LANDS + 100).style}>
            <button className="btn-outline whitespace-nowrap px-3 text-primary" aria-haspopup="dialog"
              disabled={building !== null || recap.income === 0} onClick={() => setPdfKind('income')}>
              <Icon name="download" size={18} /> {building === 'income' ? 'Building…' : 'Income PDF'}
            </button>
            <button className="btn-outline whitespace-nowrap px-3 text-primary" aria-haspopup="dialog"
              disabled={building !== null || recap.expenses === 0} onClick={() => setPdfKind('expenses')}>
              <Icon name="download" size={18} /> {building === 'expenses' ? 'Building…' : 'Expenses PDF'}
            </button>
          </div>
          <button className={`btn-primary w-full${rise(NET_LANDS + 150).cls}`} style={rise(NET_LANDS + 150).style} onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {/* Stop clicks on the choice sheet from reaching the backdrop (which closes the recap). */}
      <div onClick={(e) => e.stopPropagation()}>
        <PdfChoiceSheet kind={pdfKind} onPick={build} onClose={() => setPdfKind(null)} />
      </div>
    </div>
  );
}

function Figure({ label, dot, children }: { label: string; dot: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-inverse-on-surface/60">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {label}
      </div>
      <div className="mt-0.5 font-display text-xl font-bold text-inverse-on-surface tabular-nums">{children}</div>
    </div>
  );
}

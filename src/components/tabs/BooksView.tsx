'use client';
// ═══ Books — the money screen ═══
// One glance: money in, money out, what's still owed.
// Expenses can be added right here (and still by chat — "spent 80 on paint").
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BooksTotalsSkeleton from '@/components/BooksTotalsSkeleton';
import RecapsCard from '@/components/recap/RecapsCard';
import AddExpenseSheet from '@/components/AddExpenseSheet';
import RecurringBooksRow from '@/components/recurring/RecurringBooksRow';
import RecurringSkipBanner from '@/components/recurring/RecurringSkipBanner';
import { useRecurringItems } from '@/components/recurring/useRecurringItems';
import { noteUpgradeReturn } from '@/lib/upgrade-return';
import { skipKey, type Recurring } from '@/lib/recurring';
import { hideSkip, readHiddenSkips } from '@/lib/skip-hidden';
import { EXPENSES_SORT_KEY, expensesListCaption, readExpenseGrouping, readListSort } from '@/lib/list-sort';
import { createClient } from '@/lib/supabase/client';
import { getSharedUser } from '@/lib/auth-client';
import PageContainer from '@/components/PageContainer';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// Signed exact money for the hero: a negative net reads "−$120.00" (sign, not
// red — no colored numbers on this screen).
const signedMoney = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));

// Design 1b: exact cents render smaller than the dollars. This keeps a
// six-figure amount inside a half-width tile at 360px. Display only — the
// value is still the string from money(); no calculation changes.
function MoneyText({ text, centsClassName = 'text-[0.52em] tracking-[-0.01em] opacity-70' }: {
  text: string;
  centsClassName?: string;
}) {
  const dot = text.lastIndexOf('.');
  if (dot < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, dot)}
      <span className={centsClassName}>{text.slice(dot)}</span>
    </>
  );
}
// The Books count-up plays on the first visit of the day (motion inventory
// "Books › First visit of the day"); later visits that day are static. The
// stored value is the local date it last played (MOTION-SPEC §9 mechanics).
const BOOKS_COUNTED_KEY = 'onit_books_counted_day';
const localToday = () => new Date().toLocaleDateString('en-CA');

// The old chips (Gas / Materials / Meals / Phone / Insurance) predate the
// category CHECK and would now be rejected on save. Same eight values as the
// chat card, so a quick-add and a receipt file identically.

export default function Dashboard({ active = true }: { active?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [stats, setStats] = useState({ collected: 0, outstanding: 0, spent: 0, count: 0, expenseCount: 0 });
  // The "View expenses" subtitle names what that list will show (§L Q2).
  const [expensesCaption, setExpensesCaption] = useState('');
  useEffect(() => { setExpensesCaption(expensesListCaption(readListSort(EXPENSES_SORT_KEY), readExpenseGrouping())); }, []);
  // Initial-load only: without it the totals flash $0.00 / "0 invoices created"
  // before real data arrives, reading as an empty account. Cleared in finally so
  // no path can hang it true. The post-save refresh (loadStats) never toggles it,
  // so adding an expense doesn't re-flash the skeleton.
  const [loading, setLoading] = useState(true);
  // Recurring items for the list-card row and the skip banner (merge 3).
  const recurring = useRecurringItems(active);
  // Books motion (MOTION-SPEC §9). `shown` is what the hero and tiles display;
  // it tweens toward `stats`. The first open per session counts up from 0 with
  // the entrance (intro); later refreshes (after adding an expense) roll the
  // old values to the new ones. Reduced motion shows the numbers straight away.
  type Shown = { net: number; collected: number; outstanding: number; spent: number };
  const [shown, setShown] = useState<Shown | null>(null);
  const shownRef = useRef<Shown | null>(null);
  shownRef.current = shown;
  const tweenRaf = useRef(0);
  const [intro, setIntro] = useState(false);
  const [spentFlash, setSpentFlash] = useState(0);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    cancelAnimationFrame(tweenRaf.current);
    if (introTimer.current) clearTimeout(introTimer.current);
  }, []);
  function showStats(next: Shown) {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const prev = shownRef.current;
    let first = false;
    if (!prev) {
      try { first = localStorage.getItem(BOOKS_COUNTED_KEY) !== localToday(); localStorage.setItem(BOOKS_COUNTED_KEY, localToday()); } catch { first = false; }
    }
    if (reduced || (!prev && !first)) { setShown(next); return; }
    if (prev && next.spent > prev.spent) setSpentFlash((n) => n + 1);
    if (first) {
      setIntro(true);
      // Drop the entrance classes once played, so a later remount (the Spent
      // tile re-keys on a new expense) never replays the entrance.
      introTimer.current = setTimeout(() => setIntro(false), 1700);
    }
    const from: Shown = prev ?? { net: 0, collected: 0, outstanding: 0, spent: 0 };
    const keys = ['net', 'collected', 'outstanding', 'spent'] as const;
    // First open: Net counts over 700ms; tiles 560ms, landing left to right.
    const delay = first ? { net: 0, collected: 140, outstanding: 210, spent: 280 } : { net: 0, collected: 0, outstanding: 0, spent: 0 };
    const dur = first ? { net: 700, collected: 560, outstanding: 560, spent: 560 } : { net: 400, collected: 400, outstanding: 400, spent: 400 };
    cancelAnimationFrame(tweenRaf.current);
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      let done = true;
      const v = {} as Shown;
      for (const k of keys) {
        const q = Math.min(1, Math.max(0, (ts - start - delay[k]) / dur[k]));
        if (q < 1) done = false;
        v[k] = from[k] + (next[k] - from[k]) * (1 - Math.pow(1 - q, 3));
      }
      setShown(done ? next : v);
      if (!done) tweenRaf.current = requestAnimationFrame(step);
    };
    tweenRaf.current = requestAnimationFrame(step);
  }
  const [showForm, setShowForm] = useState(false);
  // "Add it" on a paused-recurring banner (3·5): the sheet prefilled with that
  // charge; saving hides the notice on this device.
  const [manualFrom, setManualFrom] = useState<Recurring | null>(null);
  const [hiddenSkips, setHiddenSkips] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setHiddenSkips(readHiddenSkips()); }, []);
  // Back from Stripe Checkout (returnTo 'books' → /dashboard?upgraded=1).
  useEffect(() => {
    if (!active) return;
    noteUpgradeReturn();
  }, [active]);

  async function loadStats() {
    const [{ data: invs }, { data: pays }, { data: exps }] = await Promise.all([
      supabase.from('invoices').select('total, status, amount_paid, kind').eq('kind', 'invoice').is('deleted_at', null),
      // The SAME ledger query as the Books summary's income, so the Collected
      // tile equals the all-time "Brought in" / income list it opens.
      supabase.from('invoice_payments')
        .select('amount, invoices!inner(kind, deleted_at)')
        .eq('invoices.kind', 'invoice')
        .is('invoices.deleted_at', null),
      supabase.from('expenses').select('amount, spent_on').is('deleted_at', null),
    ]);
    // Cash basis (Jules F2). "Collected" is money actually received: the sum of
    // the invoice_payments ledger (deposits and partial payments included), not
    // the face value of 'paid' invoices.
    // "Still owed" is the unpaid remainder of sent/overdue invoices, so a deposit
    // already collected is counted once (in collected) and not again here.
    const rows = invs ?? [];
    const collected = (pays ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const outstanding = rows
      .filter((i) => ['sent', 'overdue'].includes(i.status))
      .reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid ?? 0)), 0);
    const spent = (exps ?? []).reduce((s, e) => s + Number(e.amount), 0);
    setStats({ collected, outstanding, spent, count: rows.length, expenseCount: (exps ?? []).length });
    showStats({ net: collected - spent, collected, outstanding, spent });
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      // Signed-out guard — redirect UX only; RLS is the real boundary. Same
      // pattern as summary/settings: getSession() is a no-network local read so
      // the decision can't hang on a stalled getUser(). Middleware only refreshes
      // the cookie; it never redirects.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await getSharedUser();
      if (cancelled) return;
      if (!user) { router.replace('/login'); return; }
      try {
        await Promise.race([
          loadStats(),
          new Promise((resolve) => setTimeout(resolve, 1500))
        ]);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const net = shown?.net ?? stats.collected - stats.spent;
  const tile = shown ?? stats;
  // Design 1b zero state: the true all-zero account, not just an empty invoice
  // list (expenses alone should still render at full strength).
  const isZero = stats.collected === 0 && stats.outstanding === 0 && stats.spent === 0;
  const invoiceLabel = stats.count === 0
    ? 'No invoices yet'
    : `${stats.count} ${stats.count === 1 ? 'invoice' : 'invoices'}`;
  return (
    <PageContainer size="wide" className="space-y-4 pb-8 pt-6">
      {/* Release frames 5a: Recaps row on top (its dot matches the Books tab
          dot), then Net, the two metric tiles + Spent row, Add expense, the
          list card and Income & Expenses (§L Q4 keeps today's label). */}
      <RecapsCard />
      {/* A recurring charge On It couldn't log (3·6, L3). */}
      <RecurringSkipBanner items={recurring} hidden={hiddenSkips} onAddManually={setManualFrom} />
      {loading ? (
        <BooksTotalsSkeleton />
      ) : (
        <div className="@container">
        <div className="grid grid-cols-1 gap-3 @4xl:gap-5 @4xl:grid-cols-3">
          {/* Net hero — design 1b: number first, then "Net · all time · N
              invoices" on one line. Cream, never colored (a negative reads
              "−$…"); opens the Books summary at All time, whose "Kept" is the
              same figure. */}
          <Link
            href="/summary?period=all"
            aria-label={`Net, all time: ${signedMoney(net)}. Open Books summary`}
            data-coach="books-net"
            className={`@4xl:col-span-1 [container-type:inline-size] flex items-center justify-between gap-3 rounded-[22px] bg-inverse-surface p-5 md:p-8 shadow-card-raised transition-transform active:scale-[0.98] active:brightness-110${intro ? ' onit-rise' : ''}`}
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className={`whitespace-nowrap font-display text-[clamp(30px,13cqi,40px)] font-extrabold leading-[1.05] tracking-[-0.03em] tabular-nums ${isZero ? 'text-inverse-on-surface/50' : 'text-inverse-on-surface'}`}>
                <MoneyText text={signedMoney(net)} />
              </div>
              <div className="text-label-lg font-semibold text-inverse-on-surface/70">
                Net · all time <span className="font-normal text-inverse-on-surface/50">· {invoiceLabel}</span>
              </div>
            </div>
            <Icon name="chevron_right" size={24} className={`shrink-0 text-inverse-on-surface/60${intro ? ' onit-nudge' : ''}`} />
          </Link>
          {/* Design 1b: Owed and Collected are half-width tiles, Spent is a
              full-width row. Amounts keep their cents (the accessible label
              carries the same full figure); nothing is truncated. */}
          <div data-coach="books-stats" className="@4xl:col-span-2 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2.5 md:gap-4">
              <MetricTile href="/invoices?filter=unpaid" value={tile.outstanding} label="Still owed" dot="bg-primary-container" hint="see unpaid invoices" tone="owed" intro={intro} order={0} dim={isZero} />
              <MetricTile href="/summary?period=all#income" value={tile.collected} label="Collected" dot="bg-paid" hint="see income" intro={intro} order={1} dim={isZero} />
            </div>
            <SpentRow key={`spent-${spentFlash}`} href="/expenses" value={tile.spent} label="Spent" dot="bg-outline" hint="see expenses" intro={intro} order={2} flash={spentFlash > 0} dim={isZero} />
          </div>
        </div>
        </div>
      )}

      {/* The rest rises last on the first visit of the day (MOTION-SPEC §9:
          300 / 350 / 400ms). Mounted with the totals, like the metrics, so the
          entrance never starts on buttons already on screen. */}
      {!loading && (
        <div className="space-y-6">
          <div className="mx-auto flex max-w-lg flex-col gap-3 sm:flex-row justify-center">
            <button
              data-coach="books-add-expense"
              className={`btn-primary flex-1${intro ? ' onit-rise' : ''}`}
              style={intro ? { animationDelay: '300ms' } : undefined}
              onClick={() => setShowForm(true)}
            >
              <Icon name="add" size={22} /> Add expense
            </button>
            <Link
              href="/summary"
              className={`btn-outline flex-1 text-primary justify-center${intro ? ' onit-rise' : ''}`}
              style={intro ? { animationDelay: '400ms' } : undefined}
            >
              <Icon name="description" size={18} /> Income &amp; Expenses
            </Link>
          </div>
          {/* List card: Expenses + Recurring (merge 3 · 3·3) at bottom. */}
          <div className={`overflow-hidden rounded-[18px] border border-outline-variant/70 bg-surface-container-lowest${intro ? ' onit-rise' : ''}`}
            style={intro ? { animationDelay: '350ms' } : undefined}>
            <Link href="/expenses" className="flex h-16 items-center gap-3 px-3.5 transition-colors active:bg-surface-container">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-container-high">
                <Icon name="receipt_long" size={21} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold text-on-background">View expenses</span>
                <span className="truncate text-[13px] text-on-surface-variant">{expensesCaption}</span>
              </span>
              <span className="text-sm font-semibold text-on-surface-variant tabular-nums">{stats.expenseCount}</span>
              <Icon name="chevron_right" size={20} className="shrink-0 text-outline" />
            </Link>
            <RecurringBooksRow items={recurring} />
          </div>
        </div>
      )}

      {showForm && (
        <AddExpenseSheet onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void loadStats(); }} />
      )}
      {manualFrom && (
        <AddExpenseSheet
          initial={{
            amount: manualFrom.amount, category: manualFrom.category, spentOn: manualFrom.last_skipped_on ?? localToday(),
            note: manualFrom.vendor, fromPausedBanner: true,
          }}
          onClose={() => setManualFrom(null)}
          onSaved={() => { setHiddenSkips(hideSkip(skipKey(manualFrom))); setManualFrom(null); void loadStats(); }}
        />
      )}
    </PageContainer>
  );
}

function MetricTile({ href, value, label, dot, hint, tone = 'plain', intro = false, order = 0, dim = false }: {
  href: string; value: number; label: string; dot: string; hint: string;
  tone?: 'plain' | 'owed'; intro?: boolean; order?: number; dim?: boolean;
}) {
  // Design 1b half tile. The amount is the exact money() string, split so the
  // cents can shrink; `container-type` lets 15cqi scale it to the tile while
  // the clamp floor/ceiling keeps six figures inside 360px. Never truncated.
  const owed = tone === 'owed';
  return (
    <Link
      href={href}
      aria-label={`${label}: ${money(value)}. Tap to ${hint}`}
      className={`[container-type:inline-size] flex min-h-touch min-w-0 flex-col gap-2 rounded-[18px] border p-3.5 shadow-[0_1px_2px_rgba(34,30,24,.05)] transition-transform duration-[120ms] active:scale-[0.97] ${owed ? 'border-primary-container/40' : 'border-outline-variant/60'} bg-surface-container-lowest active:bg-surface-container${intro ? ' onit-rise' : ''}`}
      style={intro ? { animationDelay: `${70 * (order + 1)}ms` } : undefined}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}${intro ? ' onit-pop' : ''}`}
          style={intro ? { animationDelay: `${700 + 70 * order}ms` } : undefined} />
        <span className={`whitespace-nowrap text-[13px] md:text-[13.5px] font-semibold ${owed ? 'text-primary' : 'text-on-surface-variant'}`}>{label}</span>
        <span className="flex-1" />
        <Icon name="chevron_right" size={18} className={`shrink-0 ${owed ? 'text-primary/50' : 'text-outline'}`} />
      </div>
      <div className={`whitespace-nowrap font-display text-[clamp(17px,15cqi,26px)] font-extrabold leading-[1.1] tracking-[-0.03em] text-on-background tabular-nums${dim ? ' opacity-40' : ''}`}>
        <MoneyText text={money(value)} centsClassName="text-[0.62em] text-on-surface-variant/70" />
      </div>
    </Link>
  );
}

function SpentRow({ href, value, label, dot, hint, intro = false, order = 0, flash = false, dim = false }: {
  href: string; value: number; label: string; dot: string; hint: string;
  intro?: boolean; order?: number; flash?: boolean; dim?: boolean;
}) {
  // Design 1b: Spent is demoted to one full-width row, so even a six-figure
  // amount with cents has the whole row's width. `flash` still bumps the value
  // once after a new expense; no colour, per the no-coloured-numbers rule.
  return (
    <Link
      href={href}
      aria-label={`${label}: ${money(value)}. Tap to ${hint}`}
      className={`flex min-h-touch items-center gap-2.5 rounded-[16px] border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-3 transition-transform duration-[120ms] active:scale-[0.98] active:bg-surface-container${intro ? ' onit-rise' : ''}`}
      style={intro ? { animationDelay: `${70 * (order + 1)}ms` } : undefined}
    >
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}${intro ? ' onit-pop' : ''}`}
        style={intro ? { animationDelay: `${700 + 70 * order}ms` } : undefined} />
      <span className="whitespace-nowrap text-[14.5px] font-semibold text-on-surface-variant">{label}</span>
      <span className="flex-1" />
      <span className={`whitespace-nowrap font-display text-[16px] md:text-[18px] font-bold leading-none tracking-[-0.02em] text-on-surface-variant tabular-nums${dim ? ' opacity-40' : ''}${flash ? ' onit-bump' : ''}`}>
        <MoneyText text={money(value)} centsClassName="text-[0.72em] text-on-surface-variant/70" />
      </span>
      <Icon name="chevron_right" size={18} className="shrink-0 text-outline" />
    </Link>
  );
}

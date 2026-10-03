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
import { noteUpgradeReturn } from '@/lib/upgrade-return';
import { EXPENSES_SORT_KEY, expensesListCaption, readExpenseGrouping, readListSort } from '@/lib/list-sort';
import { createClient } from '@/lib/supabase/client';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// Tiles are a glance: whole dollars, compact above $100k ("$124k", "$1.2M").
// The screen each tile opens shows the exact figure with cents.
function tileMoney(n: number): string {
  if (!Number.isFinite(n)) return '$—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  // Thresholds on the ROUNDED value, so $999,600 reads "$1M", never "$1,000k".
  if (Math.round(abs / 1000) >= 1000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 100_000) return `${sign}$${Math.round(abs / 1000).toLocaleString('en-US')}k`;
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
}

// Signed exact money for the hero: a negative net reads "−$120.00" (sign, not
// red — no colored numbers on this screen).
const signedMoney = (n: number) => (n < 0 ? `−${money(-n)}` : money(n));
// The Books count-up plays on the first visit of the day (motion inventory
// "Books › First visit of the day"); later visits that day are static. The
// stored value is the local date it last played (MOTION-SPEC §9 mechanics).
const BOOKS_COUNTED_KEY = 'onit_books_counted_day';
const localToday = () => new Date().toLocaleDateString('en-CA');

// The old chips (Gas / Materials / Meals / Phone / Insurance) predate the
// category CHECK and would now be rejected on save. Same eight values as the
// chat card, so a quick-add and a receipt file identically.

export default function Dashboard() {
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
  // Back from Stripe Checkout (returnTo 'books' → /dashboard?upgraded=1).
  useEffect(() => { noteUpgradeReturn(); }, []);

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
    (async () => {
      // Signed-out guard — redirect UX only; RLS is the real boundary. Same
      // pattern as summary/settings: getSession() is a no-network local read so
      // the decision can't hang on a stalled getUser(). Middleware only refreshes
      // the cookie; it never redirects.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      try { await loadStats(); } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const net = shown?.net ?? stats.collected - stats.spent;
  const tile = shown ?? stats;
  return (
    <div className="space-y-3 px-4 pb-4 pt-3.5">
      {/* Release frames 5a: Recaps row on top (its dot matches the Books tab
          dot), then Net, the three tiles, Add expense, the list card and
          Income & Expenses (§L Q4 keeps today's label). */}
      <RecapsCard />
      {loading ? (
        <BooksTotalsSkeleton />
      ) : (
        <>
          {/* Net hero — the ONE deliberately dark element on this screen (§8).
              Number first (cream, never colored; a negative reads "−$…"), label
              under it. Opens the Books summary at All time, whose "Kept" is the
              same figure. */}
          <Link
            href="/summary?period=all"
            aria-label={`Net, all time: ${signedMoney(net)}. Open Books summary`}
            className={`flex items-center justify-between gap-3 rounded-card bg-inverse-surface p-6 shadow-card-raised transition-transform active:scale-[0.98] active:brightness-110${intro ? ' onit-rise' : ''}`}
          >
            <div className="min-w-0">
              <div className="font-display text-numeric-xl tracking-tight text-inverse-on-surface tabular-nums">{signedMoney(net)}</div>
              <div className="mt-1 text-label-lg font-semibold text-inverse-on-surface/70">Net · all time</div>
              <div className="text-xs text-inverse-on-surface/50">{stats.count} {stats.count === 1 ? 'invoice' : 'invoices'}</div>
            </div>
            <Icon name="chevron_right" size={24} className={`shrink-0 text-inverse-on-surface/60${intro ? ' onit-nudge' : ''}`} />
          </Link>
          {/* Three equal tiles, one row: whole-dollar headline, muted label with a
              small dot (meaning without colored numbers; gold only as a fill).
              Each is a button to the list whose total equals its number. */}
          <div className="grid grid-cols-3 gap-2">
            <Tile href="/summary?period=all#income" value={tile.collected} label="Collected" dot="bg-paid" hint="see income" intro={intro} order={0} />
            <Tile href="/invoices?filter=unpaid" value={tile.outstanding} label="Still owed" dot="bg-primary-container" hint="see unpaid invoices" intro={intro} order={1} />
            <Tile key={`spent-${spentFlash}`} href="/expenses" value={tile.spent} label="Spent" dot="bg-outline" hint="see expenses" intro={intro} order={2} flash={spentFlash > 0} />
          </div>
        </>
      )}

      {/* The rest rises last on the first visit of the day (MOTION-SPEC §9:
          300 / 350 / 400ms). Mounted with the totals, like the tiles, so the
          entrance never starts on buttons already on screen. */}
      {!loading && (
        <>
          <button
            className={`btn-primary w-full${intro ? ' onit-rise' : ''}`}
            style={intro ? { animationDelay: '300ms' } : undefined}
            onClick={() => setShowForm(true)}
          >
            <Icon name="add" size={22} /> Add expense
          </button>
          {/* List card: Expenses (and Recurring with merge 3). */}
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
          </div>
          <Link
            href="/summary"
            className={`btn-outline w-full text-primary${intro ? ' onit-rise' : ''}`}
            style={intro ? { animationDelay: '400ms' } : undefined}
          >
            <Icon name="description" size={18} /> Income &amp; Expenses
          </Link>
        </>
      )}

      {showForm && (
        <AddExpenseSheet onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); void loadStats(); }} />
      )}
    </div>
  );
}

function Tile({ href, value, label, dot, hint, intro = false, order = 0, flash = false }: {
  href: string; value: number; label: string; dot: string; hint: string;
  intro?: boolean; order?: number; flash?: boolean;
}) {
  // Entrance (first open per session): tiles rise 70ms apart; each dot pops as
  // its number lands. `flash` bumps the number once (a new expense); no colour,
  // per this screen's no-coloured-numbers rule.
  return (
    <Link
      href={href}
      aria-label={`${label}: ${money(value)}. Tap to ${hint}`}
      className={`relative flex min-h-touch flex-col justify-center gap-2 rounded-[18px] border border-outline-variant/60 bg-surface-container-low py-3.5 pl-3 pr-2.5 shadow-[0_1px_2px_rgba(34,30,24,.06)] transition-transform duration-[120ms] active:scale-[0.97] active:bg-surface-container${intro ? ' onit-rise' : ''}`}
      style={intro ? { animationDelay: `${70 * (order + 1)}ms` } : undefined}
    >
      <Icon name="chevron_right" size={14} className="absolute right-1.5 top-2 text-outline" />
      <div className={`truncate font-display text-[21px] font-extrabold leading-none tracking-tight text-on-background tabular-nums${flash ? ' onit-bump' : ''}`}>
        {tileMoney(value)}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}${intro ? ' onit-pop' : ''}`}
          style={intro ? { animationDelay: `${700 + 70 * order}ms` } : undefined} />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

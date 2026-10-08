'use client';
// ═══ Books — every expense, newest first ═══
// Reached from the Books tab. Receipt photos live in a PRIVATE bucket, so
// thumbnails are signed URLs, batch-signed in one round trip rather than one
// request per row.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import ExpensesSkeleton from '@/components/ExpensesSkeleton';
import SwipeableRow from '@/components/SwipeableRow';
import { freshAutoLog } from '@/lib/recurring';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import UndoToast from '@/components/UndoToast';
import DateDivider from '@/components/DateDivider';
import { SortCaption } from '@/components/SortToggle';
import SegmentedControl from '@/components/SegmentedControl';
import AddExpenseSheet from '@/components/AddExpenseSheet';
import { groupByPeriod } from '@/lib/date-groups';
import { EXPENSES_SORT_KEY, readExpenseGrouping, readListSort, sortWithinGroups, writeExpenseGrouping, writeListSort, type ExpenseGrouping, type ListSort } from '@/lib/list-sort';
import { createClient } from '@/lib/supabase/client';
import { CATEGORY_LABEL, isExpenseCategory } from '@/lib/expenses';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

/** yyyy-mm-dd read as LOCAL — `new Date('2026-07-12')` is UTC midnight and
 *  renders as the 11th for anyone behind UTC. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

interface ExpenseRow {
  id: string;
  amount: number;
  category: string;
  vendor: string | null;
  description: string | null;
  spent_on: string;
  receipt_url: string | null;
  /** Set when the recurring cron logged it (merge 3): ↻ on the row. */
  recurring_id: string | null;
  created_at: string | null;
}

// "Logged automatically" shimmers once per row per device (3·6).
const AUTOLOG_SEEN_KEY = 'onit-autolog-seen';
function takeUnseen(ids: string[]): Set<string> {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(AUTOLOG_SEEN_KEY) ?? '[]');
    const fresh = ids.filter((id) => !seen.includes(id));
    if (fresh.length) localStorage.setItem(AUTOLOG_SEEN_KEY, JSON.stringify([...fresh, ...seen].slice(0, 100)));
    return new Set(fresh);
  } catch { return new Set(); }
}

const SIGNED_URL_TTL = 3600;

export default function Books() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({}); // storage path → signed URL
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [undoTarget, setUndoTarget] = useState<ExpenseRow | null>(null);
  // Newest (default) / A–Z inside each week, remembered per device.
  const [sort, setSort] = useState<ListSort>('newest');
  useEffect(() => { setSort(readListSort(EXPENSES_SORT_KEY)); }, []);
  function chooseSort(v: ListSort) {
    setSort(v);
    writeListSort(EXPENSES_SORT_KEY, v);
  }
  // Week (default) / Month groups, each with its own subtotals (§L Q2).
  const [grouping, setGrouping] = useState<ExpenseGrouping>('week');
  useEffect(() => { setGrouping(readExpenseGrouping()); }, []);
  function chooseGrouping(v: ExpenseGrouping) {
    setGrouping(v);
    writeExpenseGrouping(v);
  }
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [shimmer, setShimmer] = useState<Set<string>>(new Set());
  const shimmerTaken = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    // spent_on is the user-facing date; created_at breaks ties so two expenses
    // logged on the same day keep a stable, genuinely-newest-first order.
    const { data } = await supabase
      .from('expenses')
      .select('id, amount, category, vendor, description, spent_on, receipt_url, recurring_id, created_at')
      .is('deleted_at', null)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);

    const list = (data ?? []) as ExpenseRow[];
    setRows(list);
    setLoading(false);
    // Taken once per visit (a reload after add / delete keeps the same set).
    if (!shimmerTaken.current) shimmerTaken.current = takeUnseen(list.filter((r) => freshAutoLog(r)).map((r) => r.id));
    setShimmer(shimmerTaken.current);

    const paths = list.map((r) => r.receipt_url).filter((p): p is string => Boolean(p));
    if (!paths.length) return;
    const { data: signed } = await supabase.storage.from('receipts').createSignedUrls(paths, SIGNED_URL_TTL);
    if (!signed) return;
    // flatMap rather than filter+map: `path` is nullable on the response type
    // and a filter callback doesn't narrow it for the map that follows.
    setThumbs(Object.fromEntries(
      signed.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : []))
    ));
  }, [supabase]);

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
      void load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  // Same ordering as the invoices list: newest first, then name A→Z. Tier 1 is
  // spent_on (the displayed expense date, matching the invoices list's use of its
  // displayed date). Tier 2 is the same field shown as the row's title — vendor,
  // falling back to description. This replaces the previous created_at same-day
  // tiebreak with the name tier so both lists order identically.
  const label = (e: ExpenseRow) => e.vendor || e.description || '';
  const categoryOf = (e: ExpenseRow) => (isExpenseCategory(e.category) ? CATEGORY_LABEL[e.category] : 'Other');
  // Search: vendor, description or category, case-insensitive.
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter((e) => [e.vendor, e.description, categoryOf(e)].some((v) => v?.toLowerCase().includes(q)))
    : rows;
  const sorted = [...visible].sort((a, b) =>
    b.spent_on.localeCompare(a.spent_on) ||           // Tier 1: newest → oldest
    label(a).localeCompare(label(b)));                // Tier 2: vendor → description A→Z

  // Week dividers with a running subtotal. Weeks are clamped to their month, so
  // each week's subtotal stays within one month and rolls up to the monthly
  // total on the summary page (see date-groups). Books shows the subtotal.
  const byPeriod = groupByPeriod(sorted, (e) => e.spent_on, (e) => Number(e.amount), grouping);
  // A–Z: the same groups and subtotals; only the rows inside each group reorder.
  const groups = sort === 'az' ? sortWithinGroups(byPeriod, label, (e) => e.spent_on) : byPeriod;

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;
    const now = new Date().toISOString();
    setRows((r) => r.filter((e) => e.id !== target.id));
    setDeleteTarget(null);

    const { error } = await supabase
      .from('expenses')
      .update({ deleted_at: now })
      .eq('id', target.id);

    setDeleting(false);
    if (error) {
      setRows((r) => [...r, target]);
    } else {
      setUndoTarget(target);
    }
  }

  async function handleUndo() {
    if (!undoTarget) return;
    const target = undoTarget;
    setUndoTarget(null);
    setRows((r) => [...r, target]);

    const { error } = await supabase
      .from('expenses')
      .update({ deleted_at: null })
      .eq('id', target.id);

    if (error) {
      setRows((r) => r.filter((e) => e.id !== target.id));
    }
  }

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Release frames 4b: title + gold "+" (the same Add expense sheet as
          Books), search, Week / Month + sort, then the groups. */}
      <div className="flex items-center justify-between px-1 pb-2.5">
        <h1 className="font-display text-[28px] font-extrabold leading-tight">Expenses</h1>
        <button aria-label="Add expense" onClick={() => setAdding(true)}
          className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-on-background active:scale-90">
          <Icon name="add" size={24} />
        </button>
      </div>
      {loading ? (
        <ExpensesSkeleton />
      ) : (
        <>
          {rows.length === 0 && (
            <div className="mt-16 text-center">
              <Icon name="receipt_long" size={40} className="text-primary" />
              <p className="mt-2 text-body-md text-on-surface-variant">
                Snap a receipt in Chat, or just say &ldquo;spent 45 on gas at Shell.&rdquo;
                <br />I&apos;ll file it here.
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <label className="flex h-11 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5">
                <Icon name="search" size={20} className="text-on-surface-variant/70" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search vendor or category" aria-label="Search vendor or category"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none placeholder:text-on-surface-variant/60" />
              </label>
              <div className="mt-2 flex items-center justify-between gap-2">
                <SegmentedControl label="Group expenses by" value={grouping} onChange={chooseGrouping}
                  options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] as const} />
                <SortCaption value={sort} onChange={chooseSort} azLabel="A–Z by vendor" label="Sort expenses" />
              </div>
            </>
          )}
          {rows.length > 0 && visible.length === 0 && (
            <p className="mt-10 text-center text-on-surface-variant">No expenses match &ldquo;{query.trim()}&rdquo;</p>
          )}
          <div>
            {groups.map((g) => (
              <div key={g.key}>
                <DateDivider label={g.label} subtotal={g.subtotal} />
                <div className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest">
                  {g.items.map((e) => {
                    const thumb = e.receipt_url ? thumbs[e.receipt_url] : null;
                    const name = e.vendor || e.description || 'Expense';
                    return (
                      <SwipeableRow key={e.id} flat onDelete={() => setDeleteTarget(e)}>
                        <div className={`relative flex min-h-[58px] items-center gap-3 overflow-hidden border-b border-outline-variant/40 bg-surface-container-lowest px-3.5 py-2${shimmer.has(e.id) ? ' onit-autolog' : ''}`}>
                          {thumb ? (
                            <button
                              aria-label={`View the receipt from ${name}`}
                              onClick={() => setLightbox(thumb)}
                              className="shrink-0 transition active:scale-95"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumb} alt="" className="h-[34px] w-[34px] rounded-[10px] border border-outline-variant/40 object-cover" />
                            </button>
                          ) : (
                            <span aria-hidden className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-surface-container-high font-display text-[13px] font-bold text-on-surface-variant">
                              {e.receipt_url ? <Icon name="image" size={18} /> : name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[15.5px] font-semibold">{name}</span>
                              {e.recurring_id && <><Icon name="autorenew" size={15} className="shrink-0 text-[#B8941F]" /><span className="sr-only">, recurring</span></>}
                            </div>
                            <div className="text-[12.5px] text-on-surface-variant">
                              {freshAutoLog(e) ? 'Logged automatically' : categoryOf(e)} · {localDate(e.spent_on).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                          <div className="shrink-0 font-display text-[15px] font-bold tabular-nums">{money(Number(e.amount))}</div>
                        </div>
                      </SwipeableRow>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {adding && <AddExpenseSheet onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `${deleteTarget.vendor || deleteTarget.description || 'Expense'} ($${deleteTarget.amount})` : ''}
        recordType="expense"
        busy={deleting}
      />

      {undoTarget && (
        <UndoToast
          message="Expense deleted."
          onUndo={handleUndo}
          onDismiss={() => setUndoTarget(null)}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-on-background/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Your receipt" className="max-h-full max-w-full rounded-card object-contain" />
          <button
            aria-label="Close receipt"
            className="absolute right-4 top-4 grid h-touch w-touch place-items-center rounded-full bg-background text-on-background"
            onClick={() => setLightbox(null)}
          >
            <Icon name="close" size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

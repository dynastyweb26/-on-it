'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import InvoicesSkeleton from '@/components/InvoicesSkeleton';
import SwipeableRow from '@/components/SwipeableRow';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import UndoToast from '@/components/UndoToast';
import DateDivider from '@/components/DateDivider';
import { SortCaption } from '@/components/SortToggle';
import { groupByPeriod } from '@/lib/date-groups';
import { INVOICES_SORT_KEY, readListSort, sortWithinGroups, writeListSort, type ListSort } from '@/lib/list-sort';
import { localDay } from '@/lib/tax-summary';
import { createClient } from '@/lib/supabase/client';
import { formatDocNumber } from '@/lib/documents';

interface Row {
  id: string; kind: string; invoice_number: number; client_name: string;
  total: number; status: string; created_at: string; due_date: string | null;
  converted_from: string | null; amount_paid: number | null; viewed_at?: string | null;
}
type Filter = 'all' | 'unpaid' | 'paid' | 'quote';
const FILTERS: readonly Filter[] = ['all', 'unpaid', 'paid', 'quote'];
const isFilter = (v: string | null): v is Filter => FILTERS.includes(v as Filter);
// What an unpaid invoice still owes: the same formula as Books' "Still owed".
const balanceDue = (r: Row) => Math.max(0, Number(r.total) - Number(r.amount_paid ?? 0));
const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// Status tags (release frames 4a; Design Standard §2: always icon + text).
// A sent invoice with a due date reads "DUE OCT 16"; a viewed one swaps its
// icon to the eye.
const TAG: Record<string, { cls: string; icon: IconName }> = {
  paid: { cls: 'bg-paid-container text-paid', icon: 'check_circle' },
  sent: { cls: 'bg-primary-soft text-primary-on-container', icon: 'send' },
  overdue: { cls: 'bg-error-container text-on-error-container', icon: 'warning' },
  draft: { cls: 'bg-draft-container text-draft', icon: 'history' },
  void: { cls: 'bg-draft-container text-draft line-through', icon: 'block' },
  converted: { cls: 'bg-surface-container-high text-on-surface-variant', icon: 'sync' },
};
const shortDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
function tagFor(r: Row, converted: boolean): { key: string; text: string; cls: string; icon: IconName } {
  if (converted) return { key: 'converted', text: 'CONVERTED', ...TAG.converted };
  const base = TAG[r.status] ?? TAG.draft;
  if (r.status === 'sent' && r.kind === 'invoice' && r.due_date) {
    return { key: `due-${r.viewed_at ? 'v' : 's'}`, text: `DUE ${shortDate(r.due_date)}`, ...base, icon: r.viewed_at ? 'visibility' : base.icon };
  }
  if (r.status === 'sent' && r.viewed_at) return { key: 'viewed', text: 'VIEWED', ...base, icon: 'visibility' };
  return { key: r.status, text: r.status.toUpperCase(), ...base };
}
const FILTER_LABEL: Record<Filter, string> = { all: 'All', unpaid: 'Unpaid', paid: 'Paid', quote: 'Quotes' };

export default function Invoices() {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [undoTarget, setUndoTarget] = useState<Row | null>(null);
  const [travel, setTravel] = useState<'left' | 'right' | null>(null);
  // Newest (default) / A–Z by client within each month, remembered per device.
  const [sort, setSort] = useState<ListSort>('newest');
  useEffect(() => { setSort(readListSort(INVOICES_SORT_KEY)); }, []);
  function chooseSort(v: ListSort) {
    setSort(v);
    writeListSort(INVOICES_SORT_KEY, v);
  }

  useEffect(() => {
    // ?filter=unpaid|paid|quote (e.g. from the Books "Still owed" tile). Read
    // before the data arrives, while the skeleton shows, so no chip flicker.
    const q = new URLSearchParams(window.location.search).get('filter');
    if (isFilter(q)) setFilter(q);
    (async () => {
      // Signed-out guard — redirect UX only; RLS is the real boundary. Same
      // pattern as summary/settings: getSession() is a no-network local read so
      // the decision can't hang on a stalled getUser(). Middleware only refreshes
      // the cookie; it never redirects.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data } = await supabase
        .from('invoices')
        .select('id, kind, invoice_number, client_name, total, status, created_at, due_date, converted_from, amount_paid, viewed_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A quote that has already become an invoice: some invoice row points back to
  // it via converted_from. Derived from the fetched rows, so no extra query.
  const convertedQuoteIds = new Set(
    rows.map((r) => r.converted_from).filter((id): id is string => Boolean(id)),
  );
  const isConvertedQuote = (r: Row) => r.kind === 'quote' && convertedQuoteIds.has(r.id);

  const filtered = rows.filter((r) =>
    // Hide converted quotes from the main views so one job doesn't read as two
    // documents. They stay reachable under the Quotes tab.
    filter === 'all' ? !isConvertedQuote(r)
    // Unpaid / Paid are money views: invoices only. A sent quote is not owed
    // money (Books' "Still owed" excludes quotes too); it lives under Quotes.
    : filter === 'unpaid' ? r.kind === 'invoice' && ['sent', 'overdue'].includes(r.status)
    : filter === 'paid' ? r.kind === 'invoice' && r.status === 'paid'
    : r.kind === 'quote'
  );
  // One ordering for EVERY tab (All / Unpaid / Paid / Quotes): newest first, then
  // client name A→Z. The Newest / A–Z toggle (below) reorders rows inside each
  // month only. This is a client-side sort applied to the filtered set, so it
  // is the source of truth for display — the query's .order('created_at') alone is
  // not enough (this sort previously ranked by status then total, which overrode
  // it). created_at is the invoice's displayed date; ISO timestamps compare
  // chronologically, so comparing b→a gives newest→oldest.
  const sorted = [...filtered].sort((a, b) =>
    b.created_at.localeCompare(a.created_at) ||        // Tier 1: newest → oldest
    a.client_name.localeCompare(b.client_name));       // Tier 2: client name A→Z

  // Month dividers, grouped by CREATION date (every invoice has one; unpaid
  // ones have no paid date). No subtotal — a monthly figure here would be
  // ambiguous (invoiced vs collected); the summary page answers the money
  // question. localDay converts the created_at timestamp to the local day the
  // row displays, so a row never lands under the wrong month near midnight.
  const byMonth = groupByPeriod(sorted, (r) => localDay(r.created_at), (r) => Number(r.total), 'month');
  // A–Z: the same months, rows by client inside each (ties newest first).
  const groups = sort === 'az' ? sortWithinGroups(byMonth, (r) => r.client_name, (r) => r.created_at) : byMonth;
  // Unpaid view total — equals Books' "Still owed" (same rows, same formula).
  const unpaidTotal = filter === 'unpaid' ? sorted.reduce((s, r) => s + balanceDue(r), 0) : 0;
  const n = sorted.length;
  const summary = filter === 'unpaid' ? `${n} unpaid · ${money(unpaidTotal)}`
    : filter === 'paid' ? `${n} paid · ${money(sorted.reduce((s, r) => s + Number(r.total), 0))}`
    : filter === 'quote' ? `${n} ${n === 1 ? 'quote' : 'quotes'}`
    : `${n} ${n === 1 ? 'document' : 'documents'}`;

  // A chip tap also updates the URL (replace, no new history entry), so Back
  // from an invoice returns to the same filter. The list crossfades with a
  // 12px shift in the direction of travel (motion inventory "Filter tab").
  function chooseFilter(f: Filter) {
    if (f === filter) return;
    setTravel(FILTERS.indexOf(f) > FILTERS.indexOf(filter) ? 'right' : 'left');
    try { navigator.vibrate?.(5); } catch { /* unsupported */ }
    setFilter(f);
    router.replace(f === 'all' ? '/invoices' : `/invoices?filter=${f}`, { scroll: false });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const target = deleteTarget;
    const now = new Date().toISOString();
    setRows((r) => r.filter((row) => row.id !== target.id));
    setDeleteTarget(null);

    const { error } = await supabase
      .from('invoices')
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
      .from('invoices')
      .update({ deleted_at: null })
      .eq('id', target.id);

    if (error) {
      setRows((r) => r.filter((row) => row.id !== target.id));
    }
  }

  return (
    <div className="px-4 pb-4 pt-3.5">
      {/* Filter tabs (release frames 4a): outlined; the selected one gold. */}
      <div role="tablist" aria-label="Show" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f}
            className={`h-[42px] shrink-0 rounded-xl px-[15px] text-[15px] font-semibold text-on-background transition-colors active:scale-95
              ${filter === f ? 'border-2 border-primary-container bg-[#f6ebc6]' : 'border-[1.5px] border-outline bg-surface-container-lowest'}`}
            onClick={() => chooseFilter(f)}>{FILTER_LABEL[f]}</button>
        ))}
      </div>
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[12.5px] font-medium text-on-surface-variant">{loading ? '' : summary}</span>
        <SortCaption value={sort} onChange={chooseSort} azLabel="A–Z by client" label="Sort invoices" />
      </div>
      {loading ? (
        <InvoicesSkeleton />
      ) : (
        <div key={filter} className={travel ? `onit-list-from-${travel}` : undefined}>
          {sorted.length === 0 && (
            <p className="mt-16 text-center text-on-surface-variant">
              {filter === 'all' ? 'Nothing here yet. Head to Chat and tell me about a job.'
                : filter === 'quote' ? 'No quotes right now.' : `No ${FILTER_LABEL[filter].toLowerCase()} invoices right now.`}
            </p>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <DateDivider label={g.label} />
              <div className="space-y-2.5">
                {g.items.map((r) => {
                  const tag = tagFor(r, isConvertedQuote(r));
                  // On Unpaid, a part-paid invoice shows what it still owes
                  // (adds up to the summary), with the full total under it.
                  const partPaid = filter === 'unpaid' && Number(r.amount_paid ?? 0) > 0;
                  return (
                    <SwipeableRow key={r.id} onDelete={() => setDeleteTarget(r)}>
                      <Link href={`/invoices/${r.id}`}
                        className="flex items-center gap-3 rounded-[20px] border border-outline-variant/60 bg-surface-container-low px-4 py-3.5 transition-transform active:scale-[0.98]">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate font-display text-lg font-bold leading-tight text-on-background">{r.client_name}</span>
                          <span className="text-[13.5px] text-on-surface-variant">
                            {formatDocNumber(r.kind, r.invoice_number)} • {new Date(r.created_at).toLocaleDateString()}
                          </span>
                          <span className="mt-1 font-display text-[26px] font-extrabold leading-tight tracking-tight text-on-background tabular-nums">
                            {money(partPaid ? balanceDue(r) : Number(r.total))}
                          </span>
                          {partPaid && <span className="text-[13px] text-on-surface-variant">due of {money(r.total)}</span>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-3.5">
                          {/* Keyed by state, so a sent → viewed change crossfades. */}
                          <span key={tag.key} className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[11px] font-bold tracking-[.06em] onit-fade-in ${tag.cls}`}>
                            <Icon name={tag.icon} size={14} />{tag.text}
                          </span>
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-container-high text-primary-on-container">
                            <Icon name="chevron_right" size={22} />
                          </span>
                        </div>
                      </Link>
                    </SwipeableRow>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget ? `${deleteTarget.client_name} (${formatDocNumber(deleteTarget.kind, deleteTarget.invoice_number)})` : ''}
        recordType={(deleteTarget?.kind as 'invoice' | 'quote') ?? 'invoice'}
        status={deleteTarget?.status}
        busy={deleting}
      />

      {undoTarget && (
        <UndoToast
          message={`${undoTarget.kind === 'quote' ? 'Quote' : 'Invoice'} deleted.`}
          onUndo={handleUndo}
          onDismiss={() => setUndoTarget(null)}
        />
      )}
    </div>
  );
}

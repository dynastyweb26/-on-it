'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/Icon';
import InvoicesSkeleton from '@/components/InvoicesSkeleton';
import InvoicesEmpty from '@/components/InvoicesEmpty';
import DateDivider from '@/components/DateDivider';
import PillTabs from '@/components/PillTabs';
import type { IconName } from '@/components/icon-names';
import { SortCaption } from '@/components/SortToggle';
import { groupByPeriod } from '@/lib/date-groups';
import { INVOICES_SORT_KEY, readListSort, sortWithinGroups, writeListSort, type ListSort } from '@/lib/list-sort';
import { localDay } from '@/lib/tax-summary';
import { createClient } from '@/lib/supabase/client';
import { formatDocNumber } from '@/lib/documents';
import { tagFor } from '@/lib/doc-tags';
import { getSharedUser } from '@/lib/auth-client';

interface Row {
  id: string; kind: string; invoice_number: number; client_name: string;
  total: number; status: string; created_at: string; due_date: string | null;
  converted_from: string | null; amount_paid: number | null; refunded_amount: number | null;
  viewed_at?: string | null; approved_at?: string | null; valid_until?: string | null;
}

type Side = 'invoices' | 'quotes';
// The filter value alone decides the segment, so a deep link can restore both
// in one state read.
type Filter = 'open' | 'paid' | 'pending' | 'signed';

const SIDES: readonly { value: Side; label: string }[] = [
  { value: 'invoices', label: 'Invoices' },
  { value: 'quotes', label: 'Estimates' },
];
const FILTERS: Record<Side, readonly Filter[]> = {
  invoices: ['open', 'paid'],
  quotes: ['pending', 'signed'],
};
// Left-to-right order on screen, used only for the list's travel direction.
const FILTER_ORDER: readonly Filter[] = ['open', 'paid', 'pending', 'signed'];
const FILTER_LABEL: Record<Filter, string> = { open: 'Open', paid: 'Paid', pending: 'Pending', signed: 'Signed' };
const SIDE_OF: Record<Filter, Side> = { open: 'invoices', paid: 'invoices', pending: 'quotes', signed: 'quotes' };
const DEFAULT_FILTER: Record<Side, Filter> = { invoices: 'open', quotes: 'pending' };
// Legacy deep links (Books "Still owed" tile, recap "View invoices"): replace
// the old values on read, write the canonical filter only.
const FILTER_ALIAS: Record<string, Filter> = {
  all: 'open', unpaid: 'open', paid: 'paid', quote: 'pending',
  open: 'open', pending: 'pending', signed: 'signed',
};
const filterFromParam = (v: string | null): Filter | null => (v && FILTER_ALIAS[v]) || null;

// What an unpaid invoice still owes: the same formula as Books' "Still owed".
const balanceDue = (r: Row) => Math.max(0, Number(r.total) - Number(r.amount_paid ?? 0));
const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

type EmptyCopy = { icon: IconName; title: string; body: string };
// Zero documents of this kind. Never "all caught up": there is nothing yet.
const FIRST_RUN: Record<Side, EmptyCopy> = {
  invoices: { icon: 'receipt_long', title: 'No invoices yet', body: 'Tell On It about a job in Chat and it shows up here.' },
  quotes: { icon: 'request_quote', title: 'No estimates yet', body: 'Tell On It about a job in Chat and it shows up here.' },
};
// This filter is empty but the other one has items.
const FILTERED_EMPTY: Record<Filter, EmptyCopy> = {
  open: { icon: 'check_circle', title: 'Nothing open', body: "You're all caught up." },
  paid: { icon: 'check_circle', title: 'No paid invoices yet', body: 'Invoices move here once you record a payment.' },
  pending: { icon: 'hourglass_empty', title: 'No pending estimates', body: 'Send an estimate and it waits here until you mark it signed.' },
  signed: { icon: 'verified', title: 'No signed estimates yet', body: 'Signed and converted estimates land here.' },
};

// The deck unmounts while an invoice or estimate is open; remembering the last
// filter at module level puts the owner back on Estimates (or Paid, Signed)
// when they come back instead of resetting to Invoices / Open.
let lastFilter: Filter = 'open';

export default function Invoices({ active = true }: { active?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(lastFilter);
  useEffect(() => { lastFilter = filter; }, [filter]);
  const [travel, setTravel] = useState<'left' | 'right' | null>(null);
  // Newest (default) / A–Z by client within each month, remembered per device.
  const [sort, setSort] = useState<ListSort>('newest');
  useEffect(() => { setSort(readListSort(INVOICES_SORT_KEY)); }, []);
  function chooseSort(v: ListSort) {
    setSort(v);
    writeListSort(INVOICES_SORT_KEY, v);
  }

  useEffect(() => {
    // Hidden deck panels must not read the route, redirect, or fetch. The
    // effect re-runs when this tab becomes active.
    if (!active) return;
    // An explicit ?filter=open|paid|pending|signed wins; legacy unpaid|quote|all
    // are mapped on read (Books "Still owed", recap "View invoices"). With no
    // query (e.g. coming back via the tab bar) keep the in-memory selection;
    // the initial state is already Invoices / Open. Read before the data
    // arrives, while the skeleton shows, so no chip flicker.
    const q = new URLSearchParams(window.location.search).get('filter');
    const wanted = filterFromParam(q);
    if (wanted) setFilter(wanted);
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
      const { data } = await supabase
        .from('invoices')
        .select('id, kind, invoice_number, client_name, total, status, created_at, due_date, converted_from, amount_paid, refunded_amount, viewed_at, approved_at, valid_until')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (cancelled) return;
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // A quote that has already become an invoice: some invoice row points back to
  // it via converted_from. Derived from the fetched rows, so no extra query.
  const convertedQuoteIds = new Set(
    rows.map((r) => r.converted_from).filter((id): id is string => Boolean(id)),
  );
  const isConvertedQuote = (r: Row) => r.kind === 'quote' && convertedQuoteIds.has(r.id);

  const matches = (r: Row, f: Filter) =>
    f === 'open' ? r.kind === 'invoice' && (r.status === 'draft' || r.status === 'sent' || r.status === 'overdue')
    : f === 'paid' ? r.kind === 'invoice' && r.status === 'paid'
    : f === 'pending' ? r.kind === 'quote' && !isConvertedQuote(r) && !r.approved_at
    : r.kind === 'quote' && (isConvertedQuote(r) || Boolean(r.approved_at));

  const filtered = rows.filter((r) => matches(r, filter));
  // One ordering for EVERY filter (Open / Paid / Pending / Signed): newest
  // first, then client name A→Z. The Newest / A–Z toggle (below) reorders rows
  // inside each month only. This is a client-side sort applied to the filtered
  // set, so it is the source of truth for display — the query's
  // .order('created_at') alone is not enough (this sort previously ranked by
  // status then total, which overrode it). created_at is the document's
  // displayed date; ISO timestamps compare chronologically, so comparing b→a
  // gives newest→oldest.
  const sorted = [...filtered].sort((a, b) =>
    b.created_at.localeCompare(a.created_at) ||        // Tier 1: newest → oldest
    a.client_name.localeCompare(b.client_name));       // Tier 2: client name A→Z

  // Month dividers, grouped by CREATION date (every document has one; unpaid
  // ones have no paid date). No subtotal — a monthly figure here would be
  // ambiguous (invoiced vs collected); the summary page answers the money
  // question. localDay converts the created_at timestamp to the local day the
  // row displays, so a row never lands under the wrong month near midnight.
  const byMonth = groupByPeriod(sorted, (r) => localDay(r.created_at), (r) => Number(r.total), 'month');
  // A–Z: the same months, rows by client inside each (ties newest first).
  const groups = sort === 'az' ? sortWithinGroups(byMonth, (r) => r.client_name, (r) => r.created_at) : byMonth;

  // Counts come from the fetched rows (the query is capped at 200), never a
  // separate count query.
  const counts: Record<Filter, number> = {
    open: rows.filter((r) => matches(r, 'open')).length,
    paid: rows.filter((r) => matches(r, 'paid')).length,
    pending: rows.filter((r) => matches(r, 'pending')).length,
    signed: rows.filter((r) => matches(r, 'signed')).length,
  };

  // Open's total is the Books "Still owed" invariant: balance due over
  // sent/overdue rows only. Drafts count toward N but never toward $X.
  const openOwed = sorted.reduce(
    (s, r) => s + (r.kind === 'invoice' && (r.status === 'sent' || r.status === 'overdue') ? balanceDue(r) : 0),
    0,
  );
  const n = sorted.length;
  const summary = filter === 'open' ? `${n} open · ${money(openOwed)}`
    : filter === 'paid' ? `${n} paid · ${money(sorted.reduce((s, r) => s + Number(r.total), 0))}`
    : `${n} ${n === 1 ? 'estimate' : 'estimates'}`;

  // First-run means the account has zero documents of this kind. Otherwise an
  // empty filter means the other filter has items ("all caught up" copy).
  const side = SIDE_OF[filter];
  const hasAnyOfSide = rows.some((r) => (side === 'invoices' ? r.kind === 'invoice' : r.kind === 'quote'));
  const emptyCopy = hasAnyOfSide ? FILTERED_EMPTY[filter] : FIRST_RUN[side];

  // A chip tap also updates the URL (replace, no new history entry), so Back
  // from a document returns to the same filter. The list crossfades with a
  // 12px shift in the direction of travel (motion inventory "Filter tab").
  function chooseFilter(f: Filter) {
    if (f === filter) return;
    setTravel(FILTER_ORDER.indexOf(f) > FILTER_ORDER.indexOf(filter) ? 'right' : 'left');
    try { navigator.vibrate?.(5); } catch { /* unsupported */ }
    setFilter(f);
    router.replace(`/invoices?filter=${f}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-4 md:px-8">
      {/* Top segment: invoices or quotes. The filter value decides it. */}
      <PillTabs label="Invoices or estimates" options={SIDES} value={SIDE_OF[filter]}
        onChange={(s) => chooseFilter(DEFAULT_FILTER[s])} />
      {/* Filter tabs (release frames 4a): outlined; the selected one gold. */}
      <div role="tablist" aria-label="Filter" data-coach="invoices-filter" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS[SIDE_OF[filter]].map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f}
            className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-[15px] text-[15px] font-semibold text-on-background transition-colors active:scale-95
              ${filter === f ? 'border-2 border-primary-container bg-sent-container' : 'border-[1.5px] border-outline-variant bg-surface-container-lowest'}`}
            onClick={() => chooseFilter(f)}>
            {FILTER_LABEL[f]}
            <span aria-hidden className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums
              ${filter === f ? 'bg-surface-container-lowest text-primary-on-container' : 'bg-surface-container text-on-surface-variant'}`}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-1">
        <span className="text-[12.5px] font-medium text-on-surface-variant">{loading ? '' : summary}</span>
        <SortCaption value={sort} onChange={chooseSort} azLabel="A–Z by client" label="Sort invoices" compact />
      </div>
      {loading ? (
        <div className="mt-4"><InvoicesSkeleton /></div>
      ) : (
        <div key={filter} data-coach="invoices-list" className={travel ? `onit-list-from-${travel}` : undefined}>
          {sorted.length === 0 && (
            <InvoicesEmpty {...emptyCopy} />
          )}
          {groups.map((g, gi) => (
            <div key={g.key}>
              <DateDivider label={g.label} flush={gi === 0} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {g.items.map((r) => {
                  const tag = tagFor(r, isConvertedQuote(r));
                  // On Open, a part-paid invoice shows what it still owes
                  // (adds up to the summary), with the full total under it.
                  const partPaid = filter === 'open' && Number(r.amount_paid ?? 0) > 0;
                  return (
                    // Holding a row must not raise the browser's link menu (Open /
                    // Copy link / Open in new tab) in the installed app; a tap still navigates.
                    <Link key={r.id} href={`/invoices/${r.id}`} draggable={false}
                      style={{ WebkitTouchCallout: 'none' }}
                      onContextMenu={(e) => e.preventDefault()}
                      className="flex h-full select-none items-center justify-between gap-3 rounded-[20px] border border-outline-variant/60 bg-surface-container-low px-4 py-3.5 transition-transform active:scale-[0.98]">
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
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
// ═══ Income — customer payments and other income ═══
// The pair's right-hand page (the left is Expenses). Same reading pattern as
// Expenses: the pinned Unaccounted for income row first, then search, then
// Week / Month groups with their own "+" subtotals and every row carrying its
// direction. Rows are invoice payments and other_income, newest first; nothing
// unreviewed from the bank is a row here (that is the pinned row).
//
// Red marks money the owner has not decided about, and it is the only red on
// the page: the pinned row's tile and icon. Every amount on a row, and every
// group total, is the one readable green.
import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import PageHeader from '@/components/layout/PageHeader';
import EmptyState from '@/components/EmptyState';
import SegmentedControl from '@/components/SegmentedControl';
import UnaccountedRow from '@/components/bank/UnaccountedRow';
import IncomeSheet, { type IncomeSheetState } from './IncomeSheet';
import { createClient } from '@/lib/supabase/client';
import { DEPOSITS_URL, depositPlan } from '@/lib/bank-deposits';
import {
  INCOME_EMPTY, UNACCOUNTED_INCOME_LABEL, UNACCOUNTED_INCOME_NOTE, groupIncome, incomeMoney,
  mergeIncome, searchIncome, type IncomeGroup, type IncomeRow, type OtherIncomeSource,
  type PaymentSource,
} from '@/lib/income';

type Grouping = 'week' | 'month';
const GROUPING_KEY = 'onit-income-grouping';

function readGrouping(): Grouping {
  try { return localStorage.getItem(GROUPING_KEY) === 'week' ? 'week' : 'month'; } catch { return 'month'; }
}

type JoinedPayment = PaymentSource & {
  invoices?: { invoice_number: number | null; client_name: string | null } | { invoice_number: number | null; client_name: string | null }[];
};

export default function IncomePane({ chrome = true }: { chrome?: boolean; active?: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('month');
  const [sheet, setSheet] = useState<IncomeSheetState | null>(null);
  const [unaccounted, setUnaccounted] = useState<{ count: number; cents: number }>({ count: 0, cents: 0 });

  useEffect(() => { setGrouping(readGrouping()); }, []);
  function chooseGrouping(value: Grouping) {
    setGrouping(value);
    try { localStorage.setItem(GROUPING_KEY, value); } catch { /* private mode */ }
  }

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const [pays, others, links] = await Promise.all([
      supabase
        .from('invoice_payments')
        .select('id, invoice_id, amount, paid_at, method, entry_type, invoices(invoice_number, client_name)')
        .order('paid_at', { ascending: false })
        .limit(200),
      supabase
        .from('other_income')
        .select('id, amount, title, client_name, received_on, note, deposit_id, classification, deleted_at')
        .is('deleted_at', null)
        .order('received_on', { ascending: false })
        .limit(200),
      supabase.from('bank_deposit_links').select('payment_id').not('payment_id', 'is', null),
    ]);
    if (pays.error || others.error) {
      // Keep whatever is on screen rather than claiming there is no income.
      console.error('income read failed', pays.error ?? others.error);
      setLoading(false);
      return;
    }
    const linked = new Set(
      ((links.data ?? []) as unknown as { payment_id: string | null }[])
        .map((row) => row.payment_id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const payments = ((pays.data ?? []) as unknown as JoinedPayment[]).map((payment) => {
      const invoice = Array.isArray(payment.invoices) ? payment.invoices[0] : payment.invoices;
      return {
        ...payment,
        invoice_number: invoice?.invoice_number ?? null,
        client_name: invoice?.client_name ?? null,
        bank_verified: linked.has(payment.id),
      };
    });
    setRows(mergeIncome(payments, (others.data ?? []) as unknown as OtherIncomeSource[]));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  // The pair's + lives in its header; it asks this pane to open its form.
  useEffect(() => {
    const open = () => setSheet({ mode: 'add' });
    window.addEventListener('onit:add-income', open);
    return () => window.removeEventListener('onit:add-income', open);
  }, []);

  // Unaccounted for income: deposits the owner has not decided yet. The route
  // is preview-only, so a 404 simply means nothing to pin.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(DEPOSITS_URL, { cache: 'no-store' });
        const plan = depositPlan(res.status, (await res.json().catch(() => null)) as unknown);
        if (!live || plan.kind !== 'rows') return;
        const open = plan.deposits.filter((deposit) => !deposit.accounted);
        setUnaccounted({
          count: open.length,
          cents: open.reduce((sum, deposit) => sum + deposit.amount_cents, 0),
        });
      } catch { /* offline: no pinned row, no false claim */ }
    })();
    return () => { live = false; };
  }, []);

  const visible = searchIncome(rows, query);
  const groups: IncomeGroup[] = groupIncome(visible, grouping);
  const caughtUp = rows.length === 0 && unaccounted.count === 0;
  const empty = caughtUp ? INCOME_EMPTY.caughtUp : INCOME_EMPTY.none;

  const addButton = (
    <button aria-label="Add income" onClick={() => setSheet({ mode: 'add' })}
      className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-on-background active:scale-90">
      <Icon name="add" size={24} />
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-4 pt-2 md:px-6">
      {chrome && (
        <PageHeader
          title="Income"
          actions={addButton}
          legacy={(
            <div className="flex items-center justify-between px-1 pb-2.5">
              <h1 className="font-display text-[28px] font-extrabold leading-tight">Income</h1>
              {addButton}
            </div>
          )}
        />
      )}

      {unaccounted.count > 0 && (
        <div className="mb-3">
          <UnaccountedRow
            count={unaccounted.count}
            amount={unaccounted.cents / 100}
            label={UNACCOUNTED_INCOME_LABEL}
            note={UNACCOUNTED_INCOME_NOTE}
            onReview={() => window.dispatchEvent(new Event('onit:bank-review-open'))}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2 pt-2" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-2xl bg-surface-container" />)}
        </div>
      ) : (
        <>
          {rows.length === 0 && (
            <EmptyState
              icon={caughtUp ? 'check_circle' : 'payments'}
              title={empty.title}
              message={empty.message}
              action="Add income"
              onAction={() => setSheet({ mode: 'add' })}
            />
          )}

          {rows.length > 0 && (
            <>
              <label className="flex h-11 items-center gap-2 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5">
                <Icon name="search" size={20} className="text-on-surface-variant/70" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search income, client or kind" aria-label="Search income, client or kind"
                  className="min-w-0 flex-1 border-0 bg-transparent text-[16px] outline-none placeholder:text-on-surface-variant/60" />
              </label>
              <div className="mt-2 flex items-center justify-between gap-2">
                <SegmentedControl label="Group income by" value={grouping} onChange={chooseGrouping}
                  options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }] as const} />
              </div>
            </>
          )}

          {rows.length > 0 && visible.length === 0 && (
            <p className="mt-10 text-center text-on-surface-variant">No income matches &ldquo;{query.trim()}&rdquo;</p>
          )}

          <div>
            {groups.map((group) => (
              <div key={group.key}>
                <div className="mt-4 mb-2 flex items-center justify-between gap-2">
                  <span className="inline-flex h-7 items-center rounded-full bg-primary-soft px-3.5 text-[12.5px] font-bold uppercase tracking-[.06em] text-primary-on-container">
                    {group.label}
                  </span>
                  <span className="font-display text-[15px] font-bold tabular-nums" style={{ color: 'var(--oi-green)' }}>
                    {incomeMoney(group.subtotal)}
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest">
                  {group.rows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onClick={() => setSheet({
                        mode: row.kind === 'payment' ? 'payment' : 'edit',
                        row,
                      })}
                      className="flex min-h-[58px] w-full items-center gap-3 border-b border-outline-variant/40 bg-surface-container-lowest px-3.5 py-2 text-left last:border-b-0 active:bg-surface-container-low"
                    >
                      <span aria-hidden className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-surface-container-high">
                        <Icon name={row.kind === 'payment' ? 'receipt_long' : 'payments'} size={18} className="text-on-surface-variant" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[15.5px] font-semibold">{row.title}</span>
                          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.06em] text-primary">Income</span>
                          {row.bankVerified && (
                            <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.06em] text-primary">Bank-verified</span>
                          )}
                        </span>
                        <span className="block text-[12.5px] text-on-surface-variant">{row.detail} · {new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
                      </span>
                      <span className="shrink-0 font-display text-[15px] font-bold tabular-nums" style={{ color: 'var(--oi-green)' }}>
                        {incomeMoney(row.amountCents)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sheet && (
        <IncomeSheet
          state={sheet}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); void load(); }}
        />
      )}
    </div>
  );
}

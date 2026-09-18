'use client';
// ═══ Books — the money screen ═══
// One glance: money in, money out, what's still owed.
// Expenses can be added right here (and still by chat — "spent 80 on paint").
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BooksTotalsSkeleton from '@/components/BooksTotalsSkeleton';
import { createClient } from '@/lib/supabase/client';
import { EXPENSE_CATEGORIES, CATEGORY_LABEL, type ExpenseCategory } from '@/lib/expenses';

const money = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : '$—';

// The old chips (Gas / Materials / Meals / Phone / Insurance) predate the
// category CHECK and would now be rejected on save. Same eight values as the
// chat card, so a quick-add and a receipt file identically.

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();
  const [stats, setStats] = useState({ collected: 0, outstanding: 0, spent: 0, count: 0 });
  // Initial-load only: without it the totals flash $0.00 / "0 invoices created"
  // before real data arrives, reading as an empty account. Cleared in finally so
  // no path can hang it true. The post-save refresh (loadStats) never toggles it,
  // so adding an expense doesn't re-flash the skeleton.
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>(''); // 'other' reveals a required field
  const [detail, setDetail] = useState('');        // optional note (normal chips) OR required text (Other)
  const [showNote, setShowNote] = useState(false); // "Add a note" reveal, normal chips only
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Field-level errors (replaces the old combined message)
  const [amountError, setAmountError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [detailError, setDetailError] = useState('');

  async function loadStats() {
    const [{ data: invs }, { data: exps }] = await Promise.all([
      supabase.from('invoices').select('total, status, amount_paid, kind').eq('kind', 'invoice').is('deleted_at', null),
      supabase.from('expenses').select('amount, spent_on').is('deleted_at', null),
    ]);
    // Cash basis (Jules F2). "Collected" is money actually received — the sum of
    // amount_paid, which the invoice_payments ledger keeps in sync — not the face
    // value of 'paid' invoices (which ignored deposits and partial payments).
    // "Still owed" is the unpaid remainder of sent/overdue invoices, so a deposit
    // already collected is counted once (in collected) and not again here.
    const rows = invs ?? [];
    const collected = rows
      .filter((i) => i.status !== 'draft')
      .reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const outstanding = rows
      .filter((i) => ['sent', 'overdue'].includes(i.status))
      .reduce((s, i) => s + Math.max(0, Number(i.total) - Number(i.amount_paid ?? 0)), 0);
    const spent = (exps ?? []).reduce((s, e) => s + Number(e.amount), 0);
    setStats({ collected, outstanding, spent, count: rows.length });
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

  function resetForm() {
    setAmount(''); setCategory(''); setDetail(''); setShowNote(false);
    setSpentOn(new Date().toISOString().slice(0, 10));
    setAmountError(''); setCategoryError(''); setDetailError('');
  }

  function selectCategory(c: ExpenseCategory) {
    const next = category === c ? '' : c;
    setCategory(next);
    // switching category resets the text field's meaning (note vs. required)
    setDetail('');
    setShowNote(false);
    setCategoryError('');
    setDetailError('');
  }

  async function saveExpense() {
    const value = Number(amount);
    const trimmedDetail = detail.trim();

    // Amount always required; description satisfied by a chip (or chip + note),
    // or by "Other" + filled text. Field-level errors, no combined message.
    let ok = true;
    if (!value || value <= 0) { setAmountError('Enter an amount.'); ok = false; } else setAmountError('');
    if (!category) { setCategoryError('Pick a category.'); ok = false; } else setCategoryError('');
    if (category === 'other' && !trimmedDetail) { setDetailError('What was it for?'); ok = false; } else setDetailError('');
    if (!ok || !category) return;

    // Chip label is the description; an optional note is appended for good records.
    const label = CATEGORY_LABEL[category];
    const description =
      category === 'other'
        ? trimmedDetail
        : trimmedDetail ? `${label} — ${trimmedDetail}` : label;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAmountError('Sign in to log expenses.'); return; }
      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        description,
        amount: value,
        category,
        spent_on: spentOn,
      });
      if (error) { setAmountError(error.message); return; }
      setShowForm(false);
      resetForm();
      void loadStats();
    } finally {
      setSaving(false);
    }
  }

  const net = stats.collected - stats.spent;
  return (
    <div className="space-y-3 px-4 py-4">
      {loading ? (
        <BooksTotalsSkeleton />
      ) : (
        <>
          {/* The ONE deliberately dark element on this screen (§8) */}
          <div className="rounded-card bg-inverse-surface p-6 shadow-card-raised">
            <div className="text-label-lg font-semibold uppercase tracking-widest text-inverse-primary/80">
              Net (all time)
            </div>
            <div className={`font-display text-numeric-xl tracking-tight ${net >= 0 ? 'text-inverse-primary' : 'text-error-container'}`}>
              {money(net)}
            </div>
            <div className="mt-1 text-xs text-inverse-on-surface/60">{stats.count} invoices created</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Collected" value={money(stats.collected)} tone="text-paid" icon="check_circle" iconCls="bg-paid-container text-paid" />
            <Stat label="Still owed" value={money(stats.outstanding)} tone="text-primary" icon="pending" iconCls="bg-primary-fixed text-primary" />
            <Stat label="Spent" value={money(stats.spent)} tone="text-error" icon="shopping_cart" iconCls="bg-error-container text-error" />
          </div>
        </>
      )}

      <button className="btn-primary w-full" onClick={() => setShowForm(true)}>
        <Icon name="add" size={22} /> Add expense
      </button>
      <a href="/expenses" className="btn-outline w-full text-primary">
        See all expenses <Icon name="arrow_forward" size={18} />
      </a>
      <a href="/summary" className="btn-outline w-full text-primary">
        <Icon name="receipt_long" size={18} /> Expense summary
      </a>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end bg-on-background/40" onClick={() => setShowForm(false)}>
          <div
            className="max-h-[88dvh] w-full max-w-lg mx-auto overflow-y-auto rounded-t-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Add expense</h2>
              <button aria-label="Close" className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant"
                onClick={() => setShowForm(false)}>
                <Icon name="close" size={24} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <input
                  className="input font-display font-bold text-lg"
                  placeholder="$ Amount" inputMode="decimal" value={amount}
                  onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); if (amountError) setAmountError(''); }}
                />
                {amountError && <p className="mt-1 text-sm text-error">{amountError}</p>}
              </div>

              {/* Chips are the primary input — a selection satisfies the description */}
              <div>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <button key={c} className={`chip ${category === c ? 'chip-selected' : ''}`}
                      aria-pressed={category === c}
                      onClick={() => selectCategory(c)}>
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
                {categoryError && <p className="mt-1 text-sm text-error">{categoryError}</p>}
              </div>

              {/* Normal chips: optional note, hidden behind a quiet link */}
              {category && category !== 'other' && !showNote && (
                <button
                  className="min-h-touch text-left text-label-lg font-semibold text-primary"
                  onClick={() => setShowNote(true)}
                >
                  Add a note
                </button>
              )}
              {category && category !== 'other' && showNote && (
                <input
                  className="input"
                  autoFocus
                  placeholder="Add a note (optional)"
                  maxLength={280}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                />
              )}

              {/* Other: required free text */}
              {category === 'other' && (
                <div>
                  <input
                    className="input"
                    autoFocus
                    placeholder="What was it for?"
                    maxLength={300}
                    value={detail}
                    onChange={(e) => { setDetail(e.target.value); if (detailError) setDetailError(''); }}
                  />
                  {detailError && <p className="mt-1 text-sm text-error">{detailError}</p>}
                </div>
              )}

              <input
                type="date" className="input"
                value={spentOn} onChange={(e) => setSpentOn(e.target.value)}
              />
              <button className="btn-primary w-full" disabled={saving} onClick={saveExpense}>
                {saving ? 'Saving…' : 'Save expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, icon, iconCls }: {
  label: string; value: string; tone: string; icon: string; iconCls: string;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${iconCls}`}>
          <Icon name={icon} size={18} />
        </span>
        <span className="text-label-lg font-semibold text-on-surface-variant/80">{label}</span>
      </div>
      <div className={`font-display text-[24px] font-bold leading-tight ${tone}`}>{value}</div>
    </div>
  );
}

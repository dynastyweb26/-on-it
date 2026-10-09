'use client';
// The Add expense sheet (Books, and the Expenses list's "+"). Extracted
// unchanged from the Books screen: amount, category chips (Other needs a
// note), optional note, date, Save. The free 5-expense cap
// (enforce_free_expense_limit) opens the paywall with the form still filled,
// and a save right after an upgrade waits for the webhook first.
import { useState } from 'react';
import Icon from '@/components/Icon';
import PaywallModal from '@/components/PaywallModal';
import { recentlyUpgraded, waitForAccess } from '@/lib/upgrade-return';
import { createClient } from '@/lib/supabase/client';
import { EXPENSE_CATEGORIES, CATEGORY_LABEL, type ExpenseCategory } from '@/lib/expenses';

/** A prefilled sheet (the Books paused-recurring banner's "Add it"). Everything stays editable. */
export type ExpensePrefill = {
  amount: number;
  category: ExpenseCategory;
  spentOn: string;   // yyyy-mm-dd
  note?: string;     // the vendor: this sheet has no vendor field, so it rides in the note
  /** Opened from the paused-recurring banner. This sheet never shows "Make it
   *  recurring?" (3·4 asks after chat saves only: no vendor field here, so
   *  repeat_candidate can't match). If a Vendor field is ever added and the
   *  prompt follows sheet saves, it must stay off when this is set: the item
   *  is already recurring. */
  fromPausedBanner?: boolean;
};

export default function AddExpenseSheet({ onClose, onSaved, initial }: {
  onClose: () => void;
  /** After a successful insert (the sheet has already reset). */
  onSaved: () => void;
  initial?: ExpensePrefill;
}) {
  const supabase = createClient();
  const [showPaywall, setShowPaywall] = useState(false); // free expense cap hit
  const [amount, setAmount] = useState(() => (initial ? String(initial.amount) : ''));
  const [category, setCategory] = useState<ExpenseCategory | ''>(() => initial?.category ?? ''); // 'other' reveals a required field
  const [detail, setDetail] = useState(() => initial?.note ?? '');  // optional note (normal chips) OR required text (Other)
  const [showNote, setShowNote] = useState(() => !!initial?.note);  // "Add a note" reveal, normal chips only
  const [spentOn, setSpentOn] = useState(() => initial?.spentOn ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Field-level errors (replaces the old combined message)
  const [amountError, setAmountError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [detailError, setDetailError] = useState('');

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
      const insert = () => supabase.from('expenses').insert({
        user_id: user.id,
        description,
        amount: value,
        category,
        spent_on: spentOn,
      });
      let { error } = await insert();
      // Just back from Stripe: the subscription reaches the DB via the webhook a
      // moment later, so the cap trigger can still say no. Wait for access to
      // flip (lib/upgrade-return.ts), then try the save once more.
      if (error?.hint === 'PAYWALL_LIMIT_EXPENSE' && recentlyUpgraded()) {
        const a = await waitForAccess((x) => x.canExpense === true);
        if (a?.canExpense === true) ({ error } = await insert());
      }
      if (error) {
        // Free expense cap (enforce_free_expense_limit): the wall, not the raw
        // DB message. The form stays filled so it saves after upgrading.
        if (error.hint === 'PAYWALL_LIMIT_EXPENSE') { setShowPaywall(true); return; }
        setAmountError(error.message);
        return;
      }
      resetForm();
      onSaved();
    } finally {
      setSaving(false);
    }
  }


  return (
    <>
          // data-kb-fit: pinned to the visible area while typing, so the sheet sits
          // on the keyboard; max-h tops out at that area (100%) and it scrolls.
          <div data-kb-fit="" className="fixed inset-0 z-50 flex items-end bg-on-background/40" onClick={onClose}>
            <div
              className="max-h-[min(88dvh,100%)] w-full max-w-lg mx-auto overflow-y-auto rounded-t-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] onit-sheet-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">Add expense</h2>
                <button aria-label="Close" className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant"
                  onClick={onClose}>
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
      {showPaywall && <PaywallModal variant="expense" returnTo="books" onClose={() => setShowPaywall(false)} />}
    </>
  );
}

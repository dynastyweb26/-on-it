'use client';
// ═══ Expense confirmation card ═══
// Deliberately mirrors the invoice preview card in chat/page.tsx: same
// `card` + primary-container ring, same icon-and-label header, same
// btn-primary / underlined-secondary button pair. An expense should feel like
// the same product as an invoice, not a bolted-on second flow.
//
// Every one of the four fields is editable in place. No confidence badges,
// no "we're 82% sure" — the user reads the receipt faster than any score, and
// a badge only teaches them to distrust the fields that don't have one.
import Icon from '@/components/Icon';
import {
  EXPENSE_CATEGORIES,
  CATEGORY_LABEL,
  type ExpenseCategory,
  type ExpenseDraft,
} from '@/lib/expenses';

interface Props {
  draft: ExpenseDraft;
  onChange: (next: ExpenseDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  /** Object URL of the attached receipt, when this came from a photo. */
  previewUrl?: string | null;
  /** Shown in place of the save button's normal label when set. */
  error?: string | null;
}

export default function ExpenseCard({
  draft, onChange, onSave, onCancel, saving, previewUrl, error,
}: Props) {
  const set = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) =>
    onChange({ ...draft, [key]: value });

  // The amount is held as a number but edited as text, so a half-typed "12."
  // survives the keystroke instead of snapping back to 12.
  const amountText = Number.isFinite(draft.amount) && draft.amount > 0
    ? String(draft.amount)
    : '';

  const canSave = draft.amount > 0 && !saving;

  return (
    <div className="card border-primary-container/50 ring-1 ring-primary-container/30">
      <div className="mb-3 flex items-center gap-2 text-label-lg font-semibold uppercase tracking-wide text-primary">
        <Icon name="receipt_long" size={18} />
        Expense
      </div>

      {previewUrl && (
        <div className="mb-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="The receipt you photographed"
            className="h-16 w-16 shrink-0 rounded-input border border-outline-variant/40 object-cover"
          />
          <p className="text-sm text-on-surface-variant">
            Here&apos;s what I read. Fix anything that&apos;s off.
          </p>
        </div>
      )}

      {/* Numbers are the hero (§1) — the amount is the largest thing here. */}
      <label className="block">
        <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          Amount
        </span>
        <div className="mt-1 flex items-center gap-1 rounded-input border border-primary-container/20 bg-surface-container px-4 focus-within:ring-2 focus-within:ring-primary-container">
          <span className="font-display text-numeric-xl font-bold tracking-tight text-on-background">$</span>
          <input
            className="min-h-touch w-full bg-transparent font-display text-numeric-xl font-bold tracking-tight text-on-background outline-none placeholder:text-on-surface-variant/40"
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount"
            value={amountText}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^0-9.]/g, '');
              set('amount', cleaned === '' ? 0 : Number(cleaned));
            }}
          />
        </div>
      </label>

      <div className="mt-3">
        <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          Category
        </span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((c: ExpenseCategory) => (
            <button
              key={c}
              className={`chip ${draft.category === c ? 'chip-selected' : ''}`}
              aria-pressed={draft.category === c}
              onClick={() => set('category', c)}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          Where
        </span>
        <input
          className="input mt-1"
          placeholder="Who you paid"
          maxLength={120}
          aria-label="Vendor"
          value={draft.vendor ?? ''}
          onChange={(e) => set('vendor', e.target.value || null)}
        />
      </label>

      <label className="mt-3 block">
        <span className="text-label-lg font-semibold uppercase tracking-wide text-on-surface-variant">
          When
        </span>
        <input
          type="date"
          className="input mt-1"
          aria-label="Date"
          value={draft.occurred_on ?? ''}
          onChange={(e) => set('occurred_on', e.target.value || null)}
        />
      </label>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      <button className="btn-primary mt-4 w-full" disabled={!canSave} onClick={onSave}>
        <Icon name="check_circle" size={18} />
        {saving ? 'Saving…' : 'Save expense'}
      </button>
      <button
        className="mt-1 min-h-touch w-full text-center text-sm text-on-surface-variant underline"
        onClick={onCancel}
      >
        Change something
      </button>
    </div>
  );
}

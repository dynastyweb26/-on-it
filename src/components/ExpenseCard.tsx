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
//
// Layout follows the Expense Card design: amount is the hero, the vendor reads
// as a sentence, category is one swipeable row, and "what" stays a single
// optional line. Tokens only — the mockup's hexes map to the app palette.
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
      <div className="flex items-center gap-2.5">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="The receipt you photographed"
            className="h-12 w-10 shrink-0 rounded-[7px] border border-outline-variant/60 object-cover"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-label-lg font-bold uppercase tracking-[0.12em] text-primary">
            Expense
          </span>
          <span className="truncate text-xs text-on-surface-variant">
            {previewUrl ? 'Scanned from receipt' : 'From your message'}
          </span>
        </div>
        <button
          type="button"
          aria-label="Cancel expense"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container active:scale-95"
          onClick={onCancel}
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      {/* Numbers are the hero (§1) — the amount is the largest thing here. */}
      <label className="mt-3 block">
        <span className="sr-only">Amount</span>
        <div className="flex min-h-touch items-baseline gap-1 rounded-input border border-transparent px-1 focus-within:border-primary-container/40 focus-within:bg-surface-container">
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

      <div className="flex min-h-touch items-center gap-2">
        <label className="flex min-h-touch min-w-0 flex-1 items-center gap-1.5 px-1">
          <span className="text-body-lg font-medium text-on-surface-variant">at</span>
          <input
            className="min-h-touch min-w-0 flex-1 border-b border-dashed border-primary/40 bg-transparent text-body-lg font-semibold text-on-background outline-none placeholder:font-medium placeholder:text-on-surface-variant/60"
            placeholder="Vendor"
            maxLength={120}
            autoComplete="off"
            autoCapitalize="words"
            aria-label="Vendor"
            value={draft.vendor ?? ''}
            onChange={(e) => set('vendor', e.target.value || null)}
          />
        </label>
        <input
          type="date"
          className="h-11 w-32 shrink-0 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 text-sm font-semibold text-on-background outline-none focus:ring-2 focus:ring-primary-container"
          aria-label="Date"
          value={draft.occurred_on ?? ''}
          onChange={(e) => set('occurred_on', e.target.value || null)}
        />
      </div>

      <div role="group" aria-label="Category" data-no-tab-swipe="true"
        className="mt-2 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {EXPENSE_CATEGORIES.map((c: ExpenseCategory) => (
          <button
            key={c}
            type="button"
            className={`chip shrink-0 ${draft.category === c ? 'chip-selected' : ''}`}
            aria-pressed={draft.category === c}
            onClick={() => set('category', c)}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <label className="mt-2 flex min-h-touch items-center gap-2 rounded-input border border-outline-variant/60 bg-surface-container px-3">
        <Icon name="edit" size={16} className="shrink-0 text-on-surface-variant/70" />
        <input
          className="min-h-touch min-w-0 flex-1 bg-transparent text-body-md text-on-background outline-none placeholder:text-on-surface-variant/60"
          placeholder="Add what you bought (optional)"
          maxLength={120}
          aria-label="What you bought"
          value={draft.description ?? ''}
          onChange={(e) => set('description', e.target.value || null)}
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

'use client';
// One card in the review stack (SPEC.txt · R2/R3/R6/R7/R8). Presentational: the
// stack owns the queue, the exit animations and the focus hand-off; this file
// owns the card's inline editors and its local fixture edits.
//
// Two shapes, one component:
//   · expense card  — merchant, amount, date, category, receipt, and the
//                     possible-match strip when Expenses already has the charge.
//   · needs-review  — modified / removed / bounced, with the change set and a
//                     Fix / Keep pair instead of Add / Already / Don't add.
//
// Nothing here writes anywhere: onPatch and onAction only move fixture state.
import { useEffect, useRef, useState, type Ref } from 'react';
import Icon from '@/components/Icon';
import { CATEGORY_LABEL, EXPENSE_CATEGORIES } from '@/lib/expenses';
import { reducedMotion } from '@/lib/list-motion';
import { dateOptions, formatDay, formatMoney, type BankItem } from '@/lib/bank-tracking';

export type CardAction = 'add' | 'already' | 'ignore' | 'hide';
type EditField = 'amount' | 'date' | null;

const AMOUNT_COUNT_MS = 320;

/** Counts the displayed amount to its new value (320ms, cubic ease-out). */
function useCountedAmount(value: number): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    if (shownRef.current === value) return;
    const start = shownRef.current;
    if (reducedMotion()) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (ts: number) => {
      const p = Math.min(1, (ts - t0) / AMOUNT_COUNT_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = start + (value - start) * eased;
      shownRef.current = p < 1 ? next : value;
      setShown(p < 1 ? next : value);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return shown;
}

export default function ReviewCard({
  item, account, cover = null, headingRef, onAction, onPatch,
}: {
  item: BankItem;
  account: string;
  /** The add/link confirmation painted over this card. */
  cover?: 'added' | 'linked' | null;
  /** Focus target after a hide ("focus moves to the next card's heading"). */
  headingRef?: Ref<HTMLHeadingElement>;
  onAction: (action: CardAction) => void;
  onPatch: (patch: Partial<Pick<BankItem, 'amount' | 'date' | 'category' | 'receipt'>>) => void;
}) {
  const review = item.review;
  const [editing, setEditing] = useState<EditField>(null);
  const [draft, setDraft] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const editAmountRef = useRef<HTMLButtonElement>(null);
  const shownAmount = useCountedAmount(item.amount);

  useEffect(() => {
    if (editing !== 'amount') return;
    amountRef.current?.focus();
    amountRef.current?.select();
  }, [editing]);

  function startAmount() {
    setDraft(item.amount ? String(item.amount) : '');
    setEditing('amount');
  }

  function commitAmount() {
    const parsed = Number(draft.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) onPatch({ amount: parsed });
    setEditing(null);
    // Done returns focus to the edit button (accessibility table).
    requestAnimationFrame(() => editAmountRef.current?.focus());
  }

  const meta = review ? review.meta : `${CATEGORY_LABEL[item.category]} · ${formatDay(item.date)} · ${account}`;

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[var(--oi-radius-card)] border border-outline-variant/70 bg-surface-container-lowest shadow-[0_14px_34px_-14px_rgba(52,40,12,.24)]">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-[18px]">
        {review ? (
          <>
            <div className="flex">
              <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-primary-soft pl-2.5 pr-3 text-[13px] font-bold text-primary">
                <Icon name="sync_problem" size={18} />
                Needs review
              </span>
            </div>
            <h3 ref={headingRef} tabIndex={-1} className="pr-8 font-display text-[24px] font-extrabold leading-[1.2] outline-none">
              {review.title}
            </h3>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-surface-container-high font-display text-lg font-extrabold">
                {item.merchant.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] font-semibold">{item.merchant}</div>
                <div className="mt-px truncate text-sm text-on-surface-variant">{meta}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface-container-low px-4 py-3.5">
              {review.changes.map((change) => (
                <div key={change.label}>
                  <div className="text-[11px] font-bold uppercase tracking-[.14em] text-on-surface-variant">{change.label}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                    <span className="text-base text-outline line-through">{change.from}</span>
                    <Icon name="arrow_forward" size={18} className="text-on-surface-variant" />
                    <span className="font-display text-[18px] font-extrabold">{change.to}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm leading-[1.45] text-on-surface-variant">{review.note}</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 pr-10">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-primary-soft font-display text-lg font-extrabold">
                {item.merchant.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h3 ref={headingRef} tabIndex={-1} className="truncate text-[18px] font-semibold outline-none">{item.merchant}</h3>
                <div className="mt-px truncate text-sm text-on-surface-variant">{account}</div>
              </div>
            </div>

            {editing === 'amount' ? (
              <div className="bank-expand flex items-center gap-2 rounded-[18px] border-2 border-primary-container bg-[#fffaf0] p-1.5 pl-4">
                <span aria-hidden className="font-display text-[30px] font-extrabold">$</span>
                <input
                  ref={amountRef}
                  inputMode="decimal"
                  aria-label="Amount"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAmount(); } }}
                  className="min-h-touch min-w-0 flex-1 bg-transparent font-display text-[30px] font-extrabold tabular-nums outline-none"
                />
                <button type="button" onClick={commitAmount} className="h-11 shrink-0 rounded-full bg-primary-container px-4 font-display text-sm font-bold transition-transform active:scale-[0.97]">
                  Done
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="font-display text-[40px] font-extrabold leading-none tracking-[-1px] tabular-nums">{formatMoney(shownAmount)}</span>
                <button
                  ref={editAmountRef}
                  type="button"
                  aria-label={`Edit amount, ${formatMoney(item.amount)}`}
                  onClick={startAmount}
                  className="grid h-11 w-11 place-items-center rounded-full bg-surface-container-high transition-transform active:scale-[0.88]"
                >
                  <Icon name="edit" size={18} />
                </button>
              </div>
            )}

            <div className="rounded-[18px] bg-surface-container-low">
              <button
                type="button"
                onClick={() => setEditing(editing === 'date' ? null : 'date')}
                aria-expanded={editing === 'date'}
                className="flex min-h-touch w-full items-center gap-3 border-b border-outline-variant/40 px-3.5 py-3 text-left"
              >
                <Icon name="schedule" size={20} className="text-on-surface-variant" />
                <span className="flex-1 text-[15px] text-on-surface-variant">Date</span>
                <span className="text-[15px] font-semibold">{formatDay(item.date)}</span>
                <Icon name="edit" size={18} className="text-on-surface-variant/70" />
              </button>
              {editing === 'date' && (
                <div role="radiogroup" aria-label="Date" className="bank-expand flex flex-wrap gap-1.5 px-3.5 pb-3">
                  {dateOptions(item.date).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={item.date === option.value}
                      onClick={() => { onPatch({ date: option.value }); setEditing(null); }}
                      className={`h-11 rounded-full border px-3 text-sm font-semibold ${
                        item.date === option.value ? 'border-primary-container bg-primary-soft' : 'border-outline-variant bg-surface-container-lowest'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setCatOpen(!catOpen)}
                aria-haspopup="listbox"
                aria-expanded={catOpen}
                className="flex min-h-touch w-full items-center gap-3 px-3.5 py-2.5 text-left"
              >
                <Icon name="sell" size={20} className="text-on-surface-variant" />
                <span className="flex-1 text-[15px] text-on-surface-variant">Category</span>
                <span className="text-[12px] font-semibold text-primary">From bank</span>
                <span className="inline-flex h-9 items-center gap-0.5 rounded-full bg-primary-soft pl-3 pr-2 text-sm font-semibold">
                  {CATEGORY_LABEL[item.category]}
                  <Icon name="expand_more" size={18} />
                </span>
              </button>
              {catOpen && (
                <div role="radiogroup" aria-label="Category" className="bank-expand flex flex-wrap gap-1.5 px-3.5 pb-3">
                  {EXPENSE_CATEGORIES.map((category) => (
                    <button
                      key={category}
                      type="button"
                      role="radio"
                      aria-checked={item.category === category}
                      onClick={() => { onPatch({ category }); setCatOpen(false); }}
                      className={`h-11 rounded-full border px-3 text-sm font-semibold ${
                        item.category === category ? 'border-primary-container bg-primary-soft' : 'border-outline-variant bg-surface-container-lowest'
                      }`}
                    >
                      {CATEGORY_LABEL[category]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {item.match && (
              <div className="flex items-center gap-3 rounded-[16px] bg-primary-soft/60 px-3.5 py-3">
                <Icon name="link" size={20} className="shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-primary">Possible match</div>
                  <div className="mt-px text-sm text-on-background">{item.match}</div>
                </div>
              </div>
            )}

            {item.receipt ? (
              <div className="bank-fade flex h-12 shrink-0 items-center gap-3 rounded-[14px] bg-surface-container-low px-2.5">
                <span aria-hidden className="h-9 w-[30px] shrink-0 rounded-[6px] bg-[repeating-linear-gradient(135deg,#efe7da_0_4px,#faf3e7_4px_8px)]" />
                <span className="flex-1 text-sm font-semibold">Receipt attached</span>
                <Icon name="check_circle" size={20} className="text-primary" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPatch({ receipt: true })}
                className="flex min-h-touch shrink-0 items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-outline-variant px-3.5 text-[15px] font-semibold"
              >
                <Icon name="receipt_long" size={20} />
                Attach receipt
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 p-[18px] pt-3">
        <button
          type="button"
          onClick={() => onAction('add')}
          className="min-h-[54px] rounded-full bg-primary-container font-display text-base font-bold text-on-background transition-transform active:scale-[0.97]"
        >
          {review ? review.fixLabel : 'Add to record'}
        </button>
        {review ? (
          <button
            type="button"
            onClick={() => onAction('ignore')}
            className="min-h-[46px] rounded-full border-[1.5px] border-outline-variant bg-surface-container-lowest text-sm font-semibold transition-transform active:scale-[0.96]"
          >
            {review.keepLabel}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAction('already')}
              className="min-h-[46px] rounded-full border-[1.5px] border-outline-variant bg-surface-container-lowest text-sm font-semibold transition-transform active:scale-[0.96]"
            >
              Already recorded
            </button>
            <button
              type="button"
              onClick={() => onAction('ignore')}
              className="min-h-[46px] rounded-full border-[1.5px] border-outline-variant bg-surface-container-lowest text-sm font-semibold transition-transform active:scale-[0.96]"
            >
              Don&apos;t add
            </button>
          </div>
        )}
      </div>

      {/* The card X is last in the DOM (accessibility table's focus order) and
          pinned to the top-right corner. 44px target. */}
      <button
        type="button"
        aria-label="Hide for now"
        onClick={() => onAction('hide')}
        className="absolute right-[14px] top-[14px] grid h-11 w-11 place-items-center rounded-full border border-outline-variant/70 bg-surface-container-lowest text-on-surface-variant transition-transform active:scale-[0.88]"
      >
        <Icon name="close" size={20} />
      </button>

      {cover === 'added' && (
        <div className="bank-cover pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface-container-lowest" aria-hidden>
          <svg width="72" height="72" viewBox="0 0 72 72" className="text-primary-container">
            <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
              strokeDasharray="189" className="bank-ring-draw" style={{ transform: 'rotate(-90deg)', transformOrigin: '36px 36px' }} />
            <polyline points="24,37 32,45 48,28" fill="none" stroke="#1f1b13" strokeWidth="4.5" strokeLinecap="round"
              strokeLinejoin="round" strokeDasharray="36" className="bank-check-draw" />
          </svg>
          <span className="font-display text-base font-bold">Added</span>
        </div>
      )}

      {cover === 'linked' && (
        <div className="bank-cover pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-surface-container-lowest" aria-hidden>
          <div className="flex w-full items-center gap-3 px-6">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-primary">
              <Icon name="link" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">Linked to {item.merchant}</div>
              <div className="text-[13px] text-on-surface-variant">{formatDay(item.date)} · already in Expenses</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

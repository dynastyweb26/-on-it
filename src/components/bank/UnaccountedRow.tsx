'use client';
// The pinned "Unaccounted for" row (SPEC.txt · E2). Sits first in reading order
// after the page title on Expenses. Red is allowed here and nowhere else on the
// page: the urgency amount and the tinted icon. Tapping it opens the review
// stack; the row is gone the moment nothing is left.
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { reducedMotion } from '@/lib/list-motion';
import { formatMoney } from '@/lib/bank-tracking';

/** Counts counts and dollars to their new value (500ms, tabular figures). */
function useTween(value: number, ms = 500): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    if (shownRef.current === value) return;
    const start = shownRef.current;
    if (reducedMotion()) { shownRef.current = value; setShown(value); return; }
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (ts: number) => {
      const p = Math.min(1, (ts - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = start + (value - start) * eased;
      shownRef.current = p < 1 ? next : value;
      setShown(p < 1 ? next : value);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms]);
  return shown;
}

export default function UnaccountedRow({ count, amount, onReview }: {
  count: number;
  amount: number;
  onReview: () => void;
}) {
  const shownCount = useTween(count);
  const shownAmount = useTween(amount);
  const items = count === 1 ? 'item' : 'items';

  return (
    <div className="bank-open" data-bank-motion>
      <button
        type="button"
        onClick={onReview}
        aria-label={`Unaccounted for, ${count} ${items}, ${formatMoney(amount)}, not in your totals. Review.`}
        className="bank-pulse-once flex w-full items-center gap-3.5 rounded-[20px] border border-outline-variant/70 bg-surface-container-lowest px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(34,30,24,.05)] transition-transform active:scale-[0.98]"
      >
        <span
          aria-hidden
          className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-error-container"
          style={{ color: 'var(--oi-alert)' }}
        >
          <Icon name="account_balance" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-on-background">Unaccounted for</span>
          <span className="mt-0.5 block truncate text-[14px] text-on-surface-variant">
            {Math.round(shownCount)} {items} · not in your totals
          </span>
        </span>
        <span
          className="shrink-0 font-display text-[15px] font-bold tabular-nums"
          style={{ color: 'var(--oi-alert)' }}
        >
          {formatMoney(shownAmount)}
        </span>
        <Icon name="chevron_right" size={22} className="shrink-0 text-on-surface-variant" />
      </button>
    </div>
  );
}

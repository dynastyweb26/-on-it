'use client';
// Newest / A–Z segmented control for the Invoices and Expenses lists
// (UI-REDESIGN-AUDIT.md §L1–L2). The gold thumb slides between the two
// segments by transform (MOTION-SPEC §13: micro, 160ms, --ease-standard);
// Reduce Motion lands it instantly (global CSS rule).
import type { ListSort } from '@/lib/list-sort';

const OPTIONS: { value: ListSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'az', label: 'A–Z' },
];

export default function SortToggle({ value, onChange, label }: {
  value: ListSort;
  onChange: (v: ListSort) => void;
  /** Accessible name, e.g. "Sort invoices". */
  label: string;
}) {
  const i = OPTIONS.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={label}
      className="relative inline-grid h-14 shrink-0 grid-cols-2 rounded-full bg-surface-container p-1">
      <span aria-hidden
        className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-primary-container shadow-card"
        style={{ transform: `translateX(${i * 100}%)`, transition: 'transform var(--motion-fast) var(--ease-standard)' }} />
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
          onClick={() => o.value !== value && onChange(o.value)}
          className={`relative z-[1] min-w-[76px] rounded-full px-4 text-label-lg transition-colors active:scale-95
            ${o.value === value ? 'font-bold text-on-background' : 'font-semibold text-on-surface-variant'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

'use client';
// Newest / A–Z segmented control for the Invoices and Expenses lists
// (UI-REDESIGN-AUDIT.md §L1–L2). The gold thumb slides between the two
// segments by transform (MOTION-SPEC §13: micro, 160ms, --ease-standard);
// Reduce Motion lands it instantly (global CSS rule).
import type { ListSort } from '@/lib/list-sort';
import Icon from '@/components/Icon';

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

/** The release frames' compact form (4a): a caption that names the order
 *  ("A–Z by client" / "Newest first") and flips it when tapped. */
export function SortCaption({ value, onChange, azLabel, label }: {
  value: ListSort;
  onChange: (v: ListSort) => void;
  /** e.g. "A–Z by client". */
  azLabel: string;
  /** Accessible name, e.g. "Sort invoices". */
  label: string;
}) {
  const az = value === 'az';
  return (
    <button type="button" aria-label={`${label}: ${az ? azLabel : 'newest first'}. Tap to switch`}
      onClick={() => onChange(az ? 'newest' : 'az')}
      className="-mr-2 flex min-h-touch shrink-0 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-on-surface-variant active:scale-95">
      <span key={value} className="flex items-center gap-1 onit-fade-in">
        <Icon name={az ? 'sort_by_alpha' : 'schedule'} size={16} />
        {az ? azLabel : 'Newest first'}
      </span>
    </button>
  );
}

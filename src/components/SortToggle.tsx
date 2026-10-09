'use client';
// Newest / A–Z sort caption for the Invoices and Expenses lists
// (UI-REDESIGN-AUDIT.md §L1–L2). The earlier segmented toggle was replaced
// by this caption in the release frames (f50ebc7).
import type { ListSort } from '@/lib/list-sort';
import Icon from '@/components/Icon';

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

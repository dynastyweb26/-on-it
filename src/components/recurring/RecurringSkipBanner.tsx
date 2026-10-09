'use client';
// Books skip banner (UI-REDESIGN-AUDIT §1.12 / L3, merge 3 · 3·6): when On It
// couldn't log a recurring charge (free limit, or an error) and hasn't logged
// a later one, Books says so — "Couldn't log Rent, free limit reached" (and
// "+ 1 more") — and the tap opens Recurring, where the row carries the same
// notice. Rises in (onit-rise).
// Paused after errors (3·5): the cron gave up and turned auto-log off, so that
// charge won't log by itself. The banner says so and offers "Add it" (the Add
// expense sheet, prefilled) next to Recurring (turn auto-log back on). A
// manual add hides that notice on this device (`hidden`, lib/skip-hidden).
import Link from 'next/link';
import Icon from '@/components/Icon';
import { RECURRING_PATH, skipNotices, type Recurring } from '@/lib/recurring';

export default function RecurringSkipBanner({ items, hidden, onAddManually }: {
  items: Recurring[] | null;
  hidden?: ReadonlySet<string>;
  onAddManually?: (item: Recurring) => void;
}) {
  const notices = items ? skipNotices(items, hidden) : [];
  if (notices.length === 0) return null;
  const more = notices.length - 1;
  const first = notices[0];
  const text = (
    <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">
      {first.text}{more > 0 ? ` · +${more} more` : ''}
    </span>
  );
  const shell = 'onit-rise rounded-card border border-error/25 bg-error-container px-3.5 py-3 text-error-on-container';

  if (first.paused && onAddManually) {
    return (
      <div role="status" className={shell}>
        <div className="flex items-start gap-3">
          <Icon name="autorenew" size={20} className="mt-0.5 shrink-0" />
          {text}
        </div>
        <div className="mt-2 flex gap-2 pl-8">
          <button className="chip min-h-touch font-semibold" onClick={() => onAddManually(first.item)}>
            Add it
          </button>
          <Link href={RECURRING_PATH} className="chip min-h-touch font-semibold">
            Recurring <Icon name="chevron_right" size={18} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Link href={RECURRING_PATH} role="status" className={`${shell} flex items-center gap-3 active:scale-[0.99]`}>
      <Icon name="autorenew" size={20} className="shrink-0" />
      {text}
      <Icon name="chevron_right" size={20} className="shrink-0" />
    </Link>
  );
}

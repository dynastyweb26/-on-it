'use client';
// Books skip banner (UI-REDESIGN-AUDIT §1.12 / L3, merge 3 · 3·6): when On It
// couldn't log a recurring charge (free limit, or an error) and hasn't logged
// a later one, Books says so — "Couldn't log Rent, free limit reached" (and
// "+ 1 more") — and the tap opens Recurring, where the row carries the same
// notice. Rises in (onit-rise).
import Link from 'next/link';
import Icon from '@/components/Icon';
import { RECURRING_PATH, skipNotices, type Recurring } from '@/lib/recurring';

export default function RecurringSkipBanner({ items }: { items: Recurring[] | null }) {
  const notices = items ? skipNotices(items) : [];
  if (notices.length === 0) return null;
  const more = notices.length - 1;
  return (
    <Link href={RECURRING_PATH} role="status"
      className="onit-rise flex items-center gap-3 rounded-card border border-error/25 bg-error-container px-3.5 py-3 text-error-on-container active:scale-[0.99]">
      <Icon name="autorenew" size={20} className="shrink-0" />
      <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug">
        {notices[0].text}{more > 0 ? ` · +${more} more` : ''}
      </span>
      <Icon name="chevron_right" size={20} className="shrink-0" />
    </Link>
  );
}

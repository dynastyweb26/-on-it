'use client';
// The Books tab badge: how many bank items are waiting in To review — expenses
// and deposits together, which is what the stack's counter says. 20px,
// --oi-alert, white ink, 2.4s ring; hidden at 0. To review only: Ignored is a
// decision and counts nowhere. The badge is aria-hidden because the tab's own
// label carries the count.
import { booksBadgeTotal } from '@/lib/books-alert';
import { useBankTracking } from './BankTrackingProvider';
import useDepositReview from './useDepositReview';

export default function BooksReviewDot({ variant = 'tab' }: { variant?: 'tab' | 'side' }) {
  const bank = useBankTracking();
  const deposits = useDepositReview(Boolean(bank?.enabled));
  if (!bank?.enabled) return null;
  const total = booksBadgeTotal(bank.pending, deposits);
  if (total === 0) return null;
  // The badge was measured against the bottom tab's 58px pill; inside the
  // rail/sidebar the icon box is 24px, so `side` pins it to the icon corner.
  const pos = variant === 'side' ? '-right-1 -top-1' : 'right-[13px] -top-0.5';
  return (
    <span
      key={total}
      aria-hidden
      className={`bank-alert-ring pointer-events-none absolute ${pos} flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background px-1 text-[11px] font-extrabold leading-none text-white tabular-nums`}
      style={{ background: 'var(--oi-alert)' }}
    >
      {total > 99 ? '99+' : total}
    </span>
  );
}

'use client';
// The Books red dot (SPEC.txt: "The Books dot is DERIVED"). One component, used
// by the tab bar, the md icon rail and the lg sidebar, so the three layouts can
// never show different state.
//
// Shows whenever unaccounted + hidden > 0 and is never cleared by opening the
// stack — only resolving or hiding everything empties it, and then it fades
// (240ms). Red here is --oi-alert, the only red on the screen. The dot itself is
// aria-hidden: the tab's own label carries "Books, 3 items to review".
import { useBankTracking } from './BankTrackingProvider';

export default function BooksReviewDot({ variant = 'tab' }: { variant?: 'tab' | 'side' }) {
  const bank = useBankTracking();
  if (!bank?.enabled) return null;
  const on = bank.unaccounted > 0;
  // The 9px dot was measured against the bottom tab's 58px pill; inside the
  // rail/sidebar the icon box is 24px, so `side` pins it to the icon corner.
  const pos = variant === 'side' ? '-right-1 -top-1' : 'right-[13px] top-0.5';
  return (
    <span
      // Re-key on the boolean only, so the dot pops once when it appears and
      // does not replay every time the count changes.
      key={on ? 'on' : 'off'}
      aria-hidden
      className={`pointer-events-none absolute ${pos} h-[9px] w-[9px] rounded-full border-2 border-background transition-opacity duration-[240ms] ${
        on ? 'bank-dot-pop bank-dot-halo opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'var(--oi-alert)' }}
    />
  );
}

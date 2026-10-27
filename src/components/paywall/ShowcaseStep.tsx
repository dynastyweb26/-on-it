'use client';
// Step 1 · What you win — the reason the wall opened (a quiet pill), then four
// demo slides that show the product doing the thing before asking for anything
// (PaywallDemo, built to design-reference/paywall-mockup.html).
//
// Slide 4 is the recaps slide and rides lib/recaps-live — off, the deck is
// three slides, never a blank one.
import Icon from '@/components/Icon';
import PaywallDemo, { type SlideId } from '@/components/paywall/PaywallDemo';
import { STEP_TITLE } from '@/lib/paywall-copy';
import { RECAPS_LIVE } from '@/lib/recaps-live';

// One reel for every wall: it always opens on the estimate approval; the
// variant only changes the reason pill.
const DECK: SlideId[] = ['estimate', 'invoice', 'paid', ...(RECAPS_LIVE ? ['recap' as const] : [])];

export default function ShowcaseStep({ reason }: {
  /** The wall's reason pill (a soft prompt may have replaced the variant's). */
  reason: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3.5 px-4 pb-4 pt-1 xl:items-stretch xl:gap-4 xl:px-14 xl:pb-0 xl:pt-2"
      style={{ animation: 'oi-slide .4s cubic-bezier(.2,.8,.2,1) both' }}
    >
      {/* The slide headlines are visual; this is the step's name for screen readers. */}
      <h2 id="paywall-step-title" tabIndex={-1} className="sr-only outline-none">{STEP_TITLE.showcase}</h2>
      <p className="flex items-center gap-[7px] whitespace-nowrap rounded-full border border-[#efe4d2] bg-white px-[13px] py-[7px] font-body text-[12.5px] font-semibold leading-none text-[#4d4635] xl:h-[33px] xl:self-start">
        <Icon name="receipt_long" size={17} className="shrink-0 text-primary" />
        {reason}
      </p>
      <PaywallDemo slides={DECK} />
    </div>
  );
}

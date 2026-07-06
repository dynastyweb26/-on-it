'use client';
/* ═══ Tutorial — swipeable visual walkthrough ═══
   Audience may have low literacy: big visuals, one or two short
   sentences per card, swipe like stories. Pure in-app, no video.  */
import { useRef, useState } from 'react';
import Icon from '@/components/Icon';

const CARDS = [
  {
    title: 'Talk. Invoice done.',
    text: 'Tap the gold mic and say the job. On It asks a question or two, then builds your invoice.',
    art: (
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-primary-container/15">
        <div className="grid h-28 w-28 place-items-center rounded-full bg-primary-container text-on-background shadow-lg">
          <Icon name="mic" size={52} filled />
        </div>
      </div>
    ),
  },
  {
    title: 'Quotes too.',
    text: 'Say "make it a quote." When they say yes, one tap turns it into an invoice.',
    art: (
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-primary-container/15">
        <Icon name="description" size={64} className="text-primary" />
        <div className="absolute bottom-6 right-4 grid h-14 w-14 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface shadow-lg">
          <Icon name="sync" size={26} />
        </div>
      </div>
    ),
  },
  {
    title: 'Track what you spend.',
    text: 'Say "spent 80 on paint" in Chat, or add it in Cash Flow. Tax write-offs included.',
    art: (
      <div className="grid h-44 w-44 place-items-center rounded-full bg-primary-container/15">
        <Icon name="account_balance_wallet" size={64} className="text-primary" />
      </div>
    ),
  },
  {
    title: 'Get paid.',
    text: "Share the invoice anywhere. If they haven't paid in 2 days, On It reminds you.",
    art: (
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-primary-container/15">
        <Icon name="attach_file" size={60} className="text-primary" />
        <div className="absolute bottom-6 right-4 grid h-14 w-14 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface shadow-lg">
          <Icon name="notifications" size={26} filled />
        </div>
      </div>
    ),
  },
];

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex justify-end px-4 py-3">
        <button
          aria-label="Close tutorial"
          className="grid h-11 w-11 place-items-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant active:scale-90"
          onClick={onClose}
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {CARDS.map((c) => (
          <div key={c.title} className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-8 px-8 pb-16">
            {c.art}
            <div className="text-center">
              <h2 className="font-display text-2xl font-extrabold">{c.title}</h2>
              <p className="mx-auto mt-3 max-w-xs text-[16px] leading-relaxed text-on-surface-variant">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {CARDS.map((_, i) => (
          <span key={i} className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-primary-container' : 'w-2 bg-outline-variant'}`} />
        ))}
      </div>
    </div>
  );
}

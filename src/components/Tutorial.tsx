'use client';
/* ═══ Tutorial — swipeable visual walkthrough ═══
   Audience may have low literacy: big visuals, one or two short
   sentences per card, swipe like stories. Pure in-app, no video.  */
import { useRef, useState } from 'react';
import { X, Mic, FileText, Wallet, BellRing, RefreshCw, Share2 } from 'lucide-react';

const CARDS = [
  {
    title: 'Talk. Invoice done.',
    text: 'Tap the gold mic and say the job. On It asks a question or two, then builds your invoice.',
    art: (
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-gold/15">
        <div className="grid h-28 w-28 place-items-center rounded-full bg-gold text-white shadow-lg">
          <Mic size={52} />
        </div>
      </div>
    ),
  },
  {
    title: 'Quotes too.',
    text: 'Say "make it a quote." When they say yes, one tap turns it into an invoice.',
    art: (
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-gold/15">
        <FileText size={64} className="text-gold" />
        <div className="absolute bottom-6 right-4 grid h-14 w-14 place-items-center rounded-full bg-ink text-paper shadow-lg">
          <RefreshCw size={26} />
        </div>
      </div>
    ),
  },
  {
    title: 'Track what you spend.',
    text: 'Say "spent 80 on paint" in Chat, or add it in Cash Flow. Tax write-offs included.',
    art: (
      <div className="grid h-44 w-44 place-items-center rounded-full bg-gold/15">
        <Wallet size={64} className="text-gold" />
      </div>
    ),
  },
  {
    title: 'Get paid.',
    text: "Share the invoice anywhere. If they haven't paid in 2 days, On It reminds you.",
    art: (
      <div className="relative grid h-44 w-44 place-items-center rounded-full bg-gold/15">
        <Share2 size={60} className="text-gold" />
        <div className="absolute bottom-6 right-4 grid h-14 w-14 place-items-center rounded-full bg-ink text-paper shadow-lg">
          <BellRing size={26} />
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
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex justify-end px-4 py-3">
        <button
          aria-label="Close tutorial"
          className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface-container-lowest text-ink/60 active:scale-90"
          onClick={onClose}
        >
          <X size={22} />
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
              <p className="mx-auto mt-3 max-w-xs text-[16px] leading-relaxed text-ink/70">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {CARDS.map((_, i) => (
          <span key={i} className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-gold' : 'w-2 bg-line'}`} />
        ))}
      </div>
    </div>
  );
}

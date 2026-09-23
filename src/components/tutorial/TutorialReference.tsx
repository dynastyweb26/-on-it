'use client';
/* ═══ TutorialReference — the always-available "How On It works" doc ═══
   Three tabs matching app nav (Chat / Invoices / Books), opening on Invoices.
   Tabs use the app's existing gold selected-state (.chip-selected) — the same
   ring every selectable element uses, no new pattern. Within a tab, slides are
   VERTICALLY SCROLLABLE (not swipeable): the app already swipes horizontally
   between tabs at the layout level, so a horizontal swipe inside a tab would
   fight that gesture; every real screen presents stacked cards in a vertical
   scroll; and reference material reads better scanned than gated one at a time.

   This surface is NOT gated by TUTORIAL_VERSION and needs no session — it holds
   no persistence state, so it opens clean for a deferred-auth guest. */
import { useLayoutEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { SlideMock } from '@/components/tutorial/mocks';
import { slidesForTab, type SlideTab } from '@/components/tutorial/slides';

// Reference tabs, in nav order. Icons match the app's bottom nav (Design
// Standard §4): Chat mic, Invoices description, Books payments.
const TABS: { key: SlideTab; label: string; icon: IconName }[] = [
  { key: 'chat', label: 'Chat', icon: 'mic' },
  { key: 'invoices', label: 'Invoices', icon: 'description' },
  { key: 'books', label: 'Books', icon: 'payments' },
];

export default function TutorialReference({ onClose }: { onClose: () => void }) {
  // Opens on Invoices — the surface a user reaches for most.
  const [active, setActive] = useState<SlideTab>('invoices');
  const slides = slidesForTab(active);

  // The scroll container is one stable DOM node across tab switches, so its
  // scrollTop survives a change of `active` — landing the next tab mid-page.
  // Reset it to the top on every tab change, before paint (useLayoutEffect), so
  // there's no flash of the previous scroll position.
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [active]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
        <span className="font-display text-lg font-extrabold">How On It works</span>
        <button
          aria-label="Close"
          className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95"
          onClick={onClose}
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      {/* Tabs — existing gold selected-state, FILL-1 icon on the active tab */}
      <div className="flex gap-2 border-b border-outline-variant/40 px-4 py-3">
        {TABS.map(({ key, label, icon }) => {
          const on = active === key;
          return (
            <button
              key={key}
              aria-pressed={on}
              className={`chip flex flex-1 items-center justify-center gap-1.5 ${on ? 'chip-selected' : ''}`}
              onClick={() => setActive(key)}
            >
              <Icon name={icon} size={18} filled={on} /> {label}
            </button>
          );
        })}
      </div>

      {/* Vertically scrollable slides for the active tab */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Tightened top rhythm (pt-4 pb-8, gap-8) lifts the stack so the top
            strip of the next mock card peeks above the fold — a self-explanatory
            scroll affordance, no indicator/arrow/fade. Content-driven heights
            mean the peek isn't guaranteed on landscape / sub-600px viewports;
            that's an accepted tradeoff over clipping content or rescaling mocks. */}
        <div className="mx-auto flex max-w-[360px] flex-col items-center gap-8 pt-4 pb-8">
          {slides.map((s) => (
            <div key={s.id} className="flex w-full flex-col items-center gap-4">
              {/* Static ring in the reference — see .spotlight-ring-static. */}
              <SlideMock mock={s.mock} spotlight={s.spotlight} active pulse={false} />
              <div className="text-center">
                <h2 className="font-display text-xl font-extrabold">{s.headline}</h2>
                <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

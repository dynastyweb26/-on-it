'use client';

/* ═══ TutorialReference — the always-available "How On It works" hub ═══
   5 sub-tabs matching the app tabs: Clients, Invoices, Chat, Books, Settings.
   Displays an overview reference for each tab with an immediate option to
   launch the interactive animated walkthrough for that single section or
   play all 5 sections as one continuous tour.
*/

import { useLayoutEffect, useRef, useState, useEffect } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { SlideMock } from '@/components/tutorial/mocks';
import { slidesForTab, type SlideTab } from '@/components/tutorial/slides';
import AnimatedWalkthrough from '@/components/tutorial/AnimatedWalkthrough';

// 5 reference sub-tabs in app nav order
const TABS: { key: SlideTab; label: string; icon: IconName }[] = [
  { key: 'clients', label: 'Clients', icon: 'group' },
  { key: 'invoices', label: 'Invoices', icon: 'description' },
  { key: 'chat', label: 'Chat', icon: 'chat_bubble' },
  { key: 'books', label: 'Books', icon: 'payments' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export default function TutorialReference({
  onClose,
  initialTab = 'clients',
}: {
  onClose: () => void;
  initialTab?: SlideTab | 'all';
}) {
  const [activeTab, setActiveTab] = useState<SlideTab>(() => {
    if (initialTab === 'all') return 'clients';
    return initialTab;
  });

  const [activeWalkthrough, setActiveWalkthrough] = useState<SlideTab | 'all' | null>(() => {
    return initialTab === 'all' ? 'all' : null;
  });

  const slides = slidesForTab(activeTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* If activeWalkthrough is set, render the full screen AnimatedWalkthrough over the hub */}
      {activeWalkthrough && (
        <AnimatedWalkthrough
          initialTab={activeWalkthrough}
          onClose={() => setActiveWalkthrough(null)}
          onTabSelect={(tab) => setActiveTab(tab)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3 bg-surface-container-lowest">
        <span className="font-display text-lg font-extrabold text-on-background">How On It Works</span>
        <button
          aria-label="Close"
          className="grid h-touch w-touch place-items-center rounded-full text-on-surface-variant transition-transform active:scale-95"
          onClick={onClose}
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      {/* 5 Sub-Tabs Navigation */}
      <div className="flex overflow-x-auto gap-1 border-b border-outline-variant/40 px-3 py-2 scrollbar-none">
        {TABS.map(({ key, label, icon }) => {
          const on = activeTab === key;
          return (
            <button
              key={key}
              aria-pressed={on}
              className={`chip flex shrink-0 items-center gap-1 px-3 py-1.5 text-xs font-semibold ${
                on ? 'chip-selected bg-primary-container text-on-background' : 'text-on-surface-variant'
              }`}
              onClick={() => setActiveTab(key)}
            >
              <Icon name={icon} size={16} filled={on} /> {label}
            </button>
          );
        })}
      </div>

      {/* Hero Tour Banner */}
      <div className="border-b border-outline-variant/30 bg-primary-soft/40 px-4 py-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-on-background">Interactive Walkthroughs</div>
          <div className="text-[11px] text-on-surface-variant">Follow along step-by-step</div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary min-h-0 py-1.5 px-3 text-xs font-bold flex items-center gap-1 shadow-xs"
            onClick={() => setActiveWalkthrough(activeTab)}
          >
            <Icon name="play_arrow" size={16} /> Launch {TABS.find((t) => t.key === activeTab)?.label} Tour
          </button>
          <button
            className="btn-outline min-h-0 py-1.5 px-3 text-xs font-bold flex items-center gap-1 bg-surface-container-lowest"
            onClick={() => setActiveWalkthrough('all')}
          >
            Play All 5
          </button>
        </div>
      </div>

      {/* Vertically scrollable slide preview cards */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[360px] flex-col items-center gap-8 pt-4 pb-8">
          {slides.map((s) => (
            <div key={s.id} className="flex w-full flex-col items-center gap-3 card p-4 border border-outline-variant/40">
              <SlideMock mock={s.mock} spotlight={s.spotlight} active pulse={false} />
              <div className="text-center mt-1">
                <h2 className="font-display text-base font-bold text-on-background">{s.headline}</h2>
                <p className="mx-auto mt-1 max-w-xs text-xs text-on-surface-variant">{s.body}</p>
              </div>
              <button
                className="mt-2 text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                onClick={() => setActiveWalkthrough(activeTab)}
              >
                <Icon name="play_arrow" size={14} /> Tap to follow along
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

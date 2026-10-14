'use client';

/* ═══ AnimatedWalkthrough — Tap-through interactive tour system ═══
   Provides per-section animated walkthroughs for all 5 tabs (Clients,
   Invoices, Chat, Books, Settings) or a continuous "Play All 5 Tabs" tour.

   Features:
     • Tap anywhere to follow along & step through
     • Hovering toaster/tooltip text pointing at each element ("this is X, this is Y")
     • Section bridge screens between tabs when playing individual tabs or the full tour
     • Deep-link support via `initialTab` or URL/event triggers
*/

import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';
import { SLIDES, slidesForTab, type SlideTab, type Slide } from '@/components/tutorial/slides';
import { SlideMock } from '@/components/tutorial/mocks';

const TABS_ORDER: { key: SlideTab; label: string; icon: IconName }[] = [
  { key: 'clients', label: 'Clients', icon: 'group' },
  { key: 'invoices', label: 'Invoices', icon: 'description' },
  { key: 'chat', label: 'Chat', icon: 'chat_bubble' },
  { key: 'books', label: 'Books', icon: 'payments' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export interface AnimatedWalkthroughProps {
  initialTab?: SlideTab | 'all';
  onClose: () => void;
  onTabSelect?: (tab: SlideTab) => void;
}

export default function AnimatedWalkthrough({
  initialTab = 'clients',
  onClose,
  onTabSelect,
}: AnimatedWalkthroughProps) {
  const isPlayAllMode = initialTab === 'all';
  const [currentTabIdx, setCurrentTabIdx] = useState<number>(() => {
    if (initialTab === 'all') return 0;
    const idx = TABS_ORDER.findIndex((t) => t.key === initialTab);
    return idx >= 0 ? idx : 0;
  });

  const activeTabMeta = TABS_ORDER[currentTabIdx];
  const activeTabSlides = slidesForTab(activeTabMeta.key);

  const [slideIdx, setSlideIdx] = useState(0);
  const [showBridge, setShowBridge] = useState(false);
  const [completedAll, setCompletedAll] = useState(false);

  // Sync state if initialTab changes
  useEffect(() => {
    if (initialTab === 'all') {
      setCurrentTabIdx(0);
    } else {
      const idx = TABS_ORDER.findIndex((t) => t.key === initialTab);
      if (idx >= 0) setCurrentTabIdx(idx);
    }
    setSlideIdx(0);
    setShowBridge(false);
    setCompletedAll(false);
  }, [initialTab]);

  const currentSlide: Slide | undefined = activeTabSlides[slideIdx];

  function advance() {
    if (showBridge || completedAll) return;

    if (slideIdx < activeTabSlides.length - 1) {
      setSlideIdx((prev) => prev + 1);
    } else {
      // Reached end of current tab's slides
      if (isPlayAllMode) {
        if (currentTabIdx < TABS_ORDER.length - 1) {
          setCurrentTabIdx((prev) => prev + 1);
          setSlideIdx(0);
        } else {
          setCompletedAll(true);
        }
      } else {
        setShowBridge(true);
      }
    }
  }

  function goBack() {
    if (slideIdx > 0) {
      setSlideIdx((prev) => prev - 1);
    } else if (currentTabIdx > 0 && isPlayAllMode) {
      const prevIdx = currentTabIdx - 1;
      const prevSlides = slidesForTab(TABS_ORDER[prevIdx].key);
      setCurrentTabIdx(prevIdx);
      setSlideIdx(prevSlides.length - 1);
    }
  }

  function handleSelectNextTab() {
    const nextIdx = (currentTabIdx + 1) % TABS_ORDER.length;
    setCurrentTabIdx(nextIdx);
    setSlideIdx(0);
    setShowBridge(false);
    onTabSelect?.(TABS_ORDER[nextIdx].key);
  }

  function handleReplayTab() {
    setSlideIdx(0);
    setShowBridge(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md select-none">
      {/* Top Bar Navigation */}
      <header className="flex items-center justify-between border-b border-outline-variant px-4 py-3 bg-surface-container-lowest/80">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-container text-on-background font-bold">
            <Icon name={activeTabMeta.icon} size={18} />
          </span>
          <div>
            <div className="font-display text-sm font-extrabold text-on-background">
              {activeTabMeta.label} Walkthrough
            </div>
            {!showBridge && !completedAll && (
              <div className="text-[11px] font-medium text-on-surface-variant">
                Step {slideIdx + 1} of {activeTabSlides.length}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPlayAllMode && (
            <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
              Full Tour ({currentTabIdx + 1}/5)
            </span>
          )}
          <button
            aria-label="Exit walkthrough"
            className="flex items-center gap-1 rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition active:scale-95"
            onClick={onClose}
          >
            <Icon name="close" size={16} /> Exit
          </button>
        </div>
      </header>

      {/* Main Area */}
      <div
        className="relative flex flex-1 flex-col items-center justify-between px-4 py-4 overflow-y-auto cursor-pointer"
        onClick={advance}
      >
        {/* Completed All Tour Screen */}
        {completedAll ? (
          <div
            className="my-auto flex max-w-sm flex-col items-center gap-4 text-center card p-6 shadow-lg border border-primary/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-container text-primary">
              <Icon name="check_circle" size={36} />
            </div>
            <h2 className="font-display text-xl font-extrabold text-on-background">
              App Tour Completed!
            </h2>
            <p className="text-body-md text-on-surface-variant">
              You have walked through all five sections of On It. You are ready to manage clients, voice invoices, log receipts, and track your books.
            </p>
            <button
              className="btn-primary w-full py-3 text-sm font-bold"
              onClick={onClose}
            >
              Start Using On It
            </button>
          </div>
        ) : showBridge ? (
          /* Single Tab Bridge Screen */
          <div
            className="my-auto flex max-w-sm flex-col items-center gap-5 text-center card p-6 shadow-lg border border-outline-variant"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-paid-container text-paid">
              <Icon name="check" size={32} />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-on-background">
                {activeTabMeta.label} Walkthrough Complete!
              </h2>
              <p className="mt-1 text-body-md text-on-surface-variant">
                You have mastered the {activeTabMeta.label} section.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2.5 pt-2">
              <button
                className="btn-primary py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                onClick={handleSelectNextTab}
              >
                Next: {TABS_ORDER[(currentTabIdx + 1) % TABS_ORDER.length].label} Walkthrough
                <Icon name="arrow_forward" size={16} />
              </button>

              <button
                className="btn-outline py-2.5 text-sm font-semibold flex items-center justify-center gap-2 text-on-background"
                onClick={handleReplayTab}
              >
                <Icon name="refresh" size={16} /> Replay {activeTabMeta.label}
              </button>

              <button
                className="py-2 text-xs font-semibold text-on-surface-variant hover:text-on-background"
                onClick={onClose}
              >
                Return to How On It Works
              </button>
            </div>
          </div>
        ) : (
          /* Active Slide Display */
          currentSlide && (
            <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-between gap-4 py-2">
              {/* Floating Toaster / Tooltip Callout */}
              <div className="w-full card p-3 border-l-4 border-l-primary bg-surface-container-lowest shadow-md animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                    <Icon name="auto_awesome" size={14} />
                    {currentSlide.tooltipTitle || `${activeTabMeta.label} Feature`}
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-medium">
                    Tap anywhere to next
                  </span>
                </div>
                <h3 className="mt-1 font-display text-sm font-bold text-on-background">
                  {currentSlide.headline}
                </h3>
                <p className="mt-0.5 text-xs text-on-surface-variant leading-snug">
                  {currentSlide.tooltipText || currentSlide.body}
                </p>
              </div>

              {/* Animated Mock Viewport */}
              <div className="w-full flex justify-center my-auto transition-transform active:scale-[0.99]">
                <SlideMock
                  mock={currentSlide.mock}
                  spotlight={currentSlide.spotlight}
                  active={true}
                  pulse={true}
                />
              </div>

              {/* Progress Dots & Prev/Next Controls */}
              <div
                className="w-full flex items-center justify-between pt-2 border-t border-outline-variant/30"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  disabled={slideIdx === 0 && (!isPlayAllMode || currentTabIdx === 0)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none rounded-full border border-outline-variant/50 active:scale-95"
                  onClick={goBack}
                >
                  <Icon name="arrow_back" size={14} /> Back
                </button>

                <div className="flex items-center gap-1.5">
                  {activeTabSlides.map((_, i) => (
                    <span
                      key={i}
                      className={`h-2 rounded-full transition-all ${
                        i === slideIdx ? 'w-5 bg-primary' : 'w-2 bg-outline-variant/60'
                      }`}
                    />
                  ))}
                </div>

                <button
                  className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold bg-primary-container text-on-background rounded-full active:scale-95"
                  onClick={advance}
                >
                  Next <Icon name="arrow_forward" size={14} />
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* Floating Prompt Banner at Bottom */}
      {!showBridge && !completedAll && (
        <div className="bg-primary-container/90 py-2 px-4 text-center border-t border-primary/20">
          <p className="text-xs font-bold text-on-background flex items-center justify-center gap-1.5">
            <Icon name="play_arrow" size={16} /> Tap anywhere to follow along
          </p>
        </div>
      )}
    </div>
  );
}

'use client';
/* ═══ CoachMarks — top-level coach-mark controller ═══
   Owns the "which tab, which step" state and drives CoachMarkOverlay.

   Lifecycle:
   • Auto-shows when an onboarded user opens the app for the first time
     (same shouldAutoShowTutorial gate as the old FirstRunTutorial).
   • "How On It works" button starts the tour from the CURRENT tab, step 0.
   • Completing or skipping a tab tour marks it done in state; finishing
     Settings marks the whole session done and calls onDone().
   • The tour follows the user's current path — if they tap a tab while the
     tour is open we jump to that tab's step 0.

   Persistence:
   • Same persistence.ts helpers (shouldAutoShowTutorial / markTutorialSeen)
     used by the old system — behaviour is identical.

   Props:
   • currentPath  — the router pathname (from usePathname in layout)
   • onDone       — called when the user finishes or skips all tours
   • active       — whether to render at all (controlled by layout) */

import { useCallback, useEffect, useState } from 'react';
import CoachMarkOverlay from './CoachMarkOverlay';
import { TOURS, TOUR_TABS } from './coach-marks';

interface Props {
  currentPath: string;
  onDone: () => void;
}

function tabForPath(path: string): string | null {
  // Exact prefix match against TOURS keys (which are the exact route roots).
  return TOUR_TABS.find((k) => path === k || path.startsWith(k + '/')) ?? null;
}

/** Index of a tab key in TOUR_TABS. */
function tabIdx(key: string) {
  return TOUR_TABS.indexOf(key);
}

export default function CoachMarks({ currentPath, onDone }: Props) {
  // stepMap: { [tabKey]: current step index } — persisted in component state
  // for the session.  -1 means "done / skipped" for that tab.
  const [stepMap, setStepMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(TOUR_TABS.map((k) => [k, 0])),
  );

  const tab = tabForPath(currentPath);
  const tour = tab ? TOURS[tab] : null;
  const stepIndex = tab ? stepMap[tab] : -1;
  const step = tour && stepIndex >= 0 ? tour.steps[stepIndex] : null;

  /** True when every tab's tour has been finished or skipped. */
  const allDone = TOUR_TABS.every((k) => stepMap[k] < 0);

  // Whenever a new tab becomes active, start it from step 0 (unless already
  // done for this session).
  useEffect(() => {
    if (!tab) return;
    setStepMap((m) => {
      if (m[tab] === -1) return m; // already done — don't reopen
      if (m[tab] === 0) return m; // already at step 0 — no change needed
      return { ...m, [tab]: 0 };
    });
  }, [tab]);

  const advance = useCallback(() => {
    if (!tab || !tour) return;
    const next = stepIndex + 1;
    if (next >= tour.steps.length) {
      // End of this tab's tour — mark it done then check if all tabs finished.
      setStepMap((m) => {
        const updated = { ...m, [tab]: -1 };
        const allFinished = TOUR_TABS.every((k) => updated[k] < 0);
        if (allFinished) setTimeout(onDone, 0);
        return updated;
      });
    } else {
      setStepMap((m) => ({ ...m, [tab]: next }));
    }
  }, [tab, tour, stepIndex, onDone]);

  const goBack = useCallback(() => {
    if (!tab || stepIndex <= 0) return;
    setStepMap((m) => ({ ...m, [tab]: stepIndex - 1 }));
  }, [tab, stepIndex]);

  const skip = useCallback(() => {
    // Mark all tabs done and exit.
    setStepMap(Object.fromEntries(TOUR_TABS.map((k) => [k, -1])));
    onDone();
  }, [onDone]);

  // Expose a "restart tour from current tab" function via a custom event so
  // the "How On It works" button in layout.tsx can re-trigger without needing
  // React context threading.
  useEffect(() => {
    function onReplay() {
      const t = tabForPath(window.location.pathname);
      if (!t) return;
      // Reset just this tab (and all subsequent tabs) so the tour replays.
      setStepMap((m) => {
        const next = { ...m };
        const from = tabIdx(t);
        TOUR_TABS.forEach((k, i) => {
          if (i >= from) next[k] = 0;
        });
        return next;
      });
    }
    window.addEventListener('onit-replay-walkthrough', onReplay);
    return () => window.removeEventListener('onit-replay-walkthrough', onReplay);
  }, []);

  if (!step || !tour || !tab) return null;
  if (allDone) return null;

  const isFinalStep =
    tab === TOUR_TABS[TOUR_TABS.length - 1] &&
    stepIndex === tour.steps.length - 1;

  return (
    <CoachMarkOverlay
      key={`${tab}-${stepIndex}`}
      step={step}
      stepIndex={stepIndex}
      totalSteps={tour.steps.length}
      tourName={tour.name}
      onNext={advance}
      onBack={goBack}
      onSkip={skip}
      isFinalStep={isFinalStep}
    />
  );
}

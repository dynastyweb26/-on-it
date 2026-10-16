'use client';
/* ═══ CoachMarks — runs ONE tab's coach-mark tour, on demand ═══
   Tours never start by themselves: no first-sign-in auto-show, nothing on
   tab switch or route change. The only entry point is the tab picker
   (TourPicker — the header "How On It works" button and Settings › Help ›
   "Replay the walkthrough"), which navigates to a tab and mounts this with
   that tab's key.

   • Runs only the chosen tab's steps; Done / Skip / backdrop tap ends it.
   • Leaving the tab mid-tour ends it too — it never follows you to another
     tab or chains into the next tab's tour.

   Props:
   • tab         — a TOURS key ('/clients', '/invoices', …)
   • currentPath — the router pathname (from usePathname in layout)
   • onDone      — called when the tour ends for any reason */

import { useCallback, useEffect, useState } from 'react';
import CoachMarkOverlay from './CoachMarkOverlay';
import { TOURS } from './coach-marks';

interface Props {
  tab: string;
  currentPath: string;
  onDone: () => void;
}

export default function CoachMarks({ tab, currentPath, onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const tour = TOURS[tab];
  const onTab = currentPath === tab || currentPath.startsWith(tab + '/');

  // Navigated away from the tour's tab → the tour is over.
  useEffect(() => {
    if (!onTab) onDone();
  }, [onTab, onDone]);

  const advance = useCallback(() => {
    if (stepIndex + 1 >= tour.steps.length) onDone();
    else setStepIndex(stepIndex + 1);
  }, [stepIndex, tour, onDone]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }, [stepIndex]);

  if (!tour || !onTab) return null;

  return (
    <CoachMarkOverlay
      key={`${tab}-${stepIndex}`}
      step={tour.steps[stepIndex]}
      stepIndex={stepIndex}
      totalSteps={tour.steps.length}
      tourName={tour.name}
      onNext={advance}
      onBack={goBack}
      onSkip={onDone}
      isFinalStep
    />
  );
}

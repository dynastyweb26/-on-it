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

import { useCallback, useEffect, useMemo, useState } from 'react';
import CoachMarkOverlay from './CoachMarkOverlay';
import { TOURS, stepsFor } from './coach-marks';

interface Props {
  tab: string;
  currentPath: string;
  onDone: () => void;
}

const visible = (sel: string) =>
  Array.from(document.querySelectorAll(sel)).some((el) => el.getClientRects().length > 0);

export default function CoachMarks({ tab, currentPath, onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const tour = TOURS[tab];
  const onTab = currentPath === tab || currentPath.startsWith(tab + '/');
  // List tabs: an empty list gets its own steps (stepsFor). null until the
  // list has loaded — or 4s pass, then assume rows and let the overlay look.
  const [isEmpty, setIsEmpty] = useState<boolean | null>(tour?.empty ? null : false);
  useEffect(() => {
    if (!tour?.empty || isEmpty !== null) return;
    const { when, ready } = tour.empty;
    const started = Date.now();
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (visible(when)) setIsEmpty(true);
      else if (visible(ready) || Date.now() - started > 4000) setIsEmpty(false);
      else t = setTimeout(check, 100);
    };
    check();
    return () => clearTimeout(t);
  }, [tour, isEmpty]);
  const steps = useMemo(() => (tour && isEmpty !== null ? stepsFor(tour, isEmpty) : []), [tour, isEmpty]);

  // Navigated away from the tour's tab → the tour is over.
  useEffect(() => {
    if (!onTab) onDone();
  }, [onTab, onDone]);

  const advance = useCallback(() => {
    if (stepIndex + 1 >= steps.length) onDone();
    else setStepIndex(stepIndex + 1);
  }, [stepIndex, steps.length, onDone]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }, [stepIndex]);

  if (!tour || !onTab || steps.length === 0) return null;

  return (
    <CoachMarkOverlay
      key={`${tab}-${stepIndex}`}
      step={steps[stepIndex]}
      stepIndex={stepIndex}
      totalSteps={steps.length}
      tourName={tour.name}
      onNext={advance}
      onBack={goBack}
      onSkip={onDone}
      isFinalStep
    />
  );
}

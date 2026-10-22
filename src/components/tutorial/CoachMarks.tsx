'use client';
/* ═══ CoachMarks — runs ONE tab's coach-mark tour ═══
   Full tab tours start on demand from the tab picker (TourPicker — the header
   "How On It works" button and Settings › Help › "Replay the walkthrough"),
   which navigates to a tab and mounts this with that tab's key. Nothing starts
   on tab switch or route change.

   One controlled exception: AppShell auto-starts the one-step CAMERA_TIP on a
   user's first signed-in visit to Chat, passing it as tourOverride. It uses
   this runner and CoachMarkOverlay, so navigation, focus and skip behaviour
   stay identical.

   • Runs only the chosen tab's steps; Done / Skip / backdrop tap ends it.
   • Leaving the tab mid-tour ends it too — it never follows you to another
     tab or chains into the next tab's tour.

   Props:
   • tab           — a TOURS key ('/clients', '/invoices', …)
   • currentPath   — the router pathname (from usePathname in layout)
   • onDone        — called when the tour ends for any reason
   • tourOverride  — a one-off tour to run instead of TOURS[tab] (camera tip) */

import { useCallback, useEffect, useMemo, useState } from 'react';
import CoachMarkOverlay from './CoachMarkOverlay';
import { TOURS, stepsFor, type CoachTour } from './coach-marks';

interface Props {
  tab: string;
  currentPath: string;
  onDone: () => void;
  tourOverride?: CoachTour;
}

const visible = (sel: string) =>
  Array.from(document.querySelectorAll(sel)).some((el) => el.getClientRects().length > 0);

export default function CoachMarks({ tab, currentPath, onDone, tourOverride }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const tour = tourOverride ?? TOURS[tab];
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
  // Tours whose steps depend on loaded data (tour.settle): wait for it, or 4s.
  const [settled, setSettled] = useState<boolean>(!tour?.settle);
  useEffect(() => {
    if (!tour?.settle || settled) return;
    const sel = tour.settle;
    const started = Date.now();
    let t: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (document.querySelector(sel) || Date.now() - started > 4000) setSettled(true);
      else t = setTimeout(check, 100);
    };
    check();
    return () => clearTimeout(t);
  }, [tour, settled]);
  const steps = useMemo(
    () => (tour && isEmpty !== null && settled
      ? stepsFor(tour, isEmpty, (sel) => document.querySelector(sel) !== null)
      : []),
    [tour, isEmpty, settled],
  );

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

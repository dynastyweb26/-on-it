'use client';
/* ═══ FirstRunTutorial — the short first-run walkthrough ═══
   Four linear slides, the Invoices path only: talk/type → read-back → check
   the card → send. No expenses, no tax, no tabs. It is gated by
   TUTORIAL_VERSION, but the gate lives in (app)/layout.tsx — this component
   takes only an onClose and holds no session/persistence state, so it stays a
   pure presentational wrapper over the shared slide set. */
import AnimatedWalkthrough from '@/components/tutorial/AnimatedWalkthrough';

export default function FirstRunTutorial({ onClose }: { onClose: () => void }) {
  return <AnimatedWalkthrough initialTab="all" onClose={onClose} />;
}

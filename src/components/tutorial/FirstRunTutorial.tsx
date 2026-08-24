'use client';
/* ═══ FirstRunTutorial — the short first-run walkthrough ═══
   Four linear slides, the Invoices path only: talk/type → read-back → check
   the card → send. No expenses, no tax, no tabs. It is gated by
   TUTORIAL_VERSION, but the gate lives in (app)/layout.tsx — this component
   takes only an onClose and holds no session/persistence state, so it stays a
   pure presentational wrapper over the shared slide set. */
import SlideCarousel from '@/components/tutorial/SlideCarousel';
import { slidesByIds } from '@/components/tutorial/slides';

// The four, in order, picked by id from the one shared source of truth.
const FIRST_RUN_IDS = ['mic', 'readback', 'draft', 'send'];

export default function FirstRunTutorial({ onClose }: { onClose: () => void }) {
  return <SlideCarousel slides={slidesByIds(FIRST_RUN_IDS)} onClose={onClose} />;
}

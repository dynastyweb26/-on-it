// /settings/plan/cancel — the cancel screen (CANCEL-FLOW-SPEC.md §2-3).
// One screen, one offer: stats, the optional reason picker, the single offer
// for the picked reason, and the Cancel button, always visible.
import CancelScreen from './CancelScreen';

export const dynamic = 'force-dynamic';

export default function CancelPage() {
  return <CancelScreen />;
}

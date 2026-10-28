// /settings/plan — the Plan sub-screen. Its own route (rather than [section])
// because /settings/plan/cancel lives under this folder, the same reason
// /settings/payouts has one. Same server wrapper as /settings.
import { connectEnabled } from '@/lib/stripe/connect';
import { subscriptionsEnabled } from '@/lib/subscriptions';
import SettingsView from '../SettingsView';

export const dynamic = 'force-dynamic';

export default function PlanPage() {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <SettingsView connectEnabled={enabled} subscriptionsEnabled={subscriptionsEnabled()} section="plan" />;
}

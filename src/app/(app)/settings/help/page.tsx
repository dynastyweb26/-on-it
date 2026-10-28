// /settings/help — the Help & feedback sub-screen. Its own route (rather than
// [section]) because /settings/help/feedback lives under this folder, the same
// reason /settings/plan and /settings/payouts have one. Same server wrapper as
// /settings.
import { connectEnabled } from '@/lib/stripe/connect';
import { subscriptionsEnabled } from '@/lib/subscriptions';
import SettingsView from '../SettingsView';

export const dynamic = 'force-dynamic';

export default function HelpPage() {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <SettingsView connectEnabled={enabled} subscriptionsEnabled={subscriptionsEnabled()} section="help" />;
}

// /settings/payouts — the payout methods index. Its own route (rather than
// [section]) because /settings/payouts/<method> lives under this folder. Same
// server wrapper as /settings: the Stripe Connect switch is read here, at
// request time.
import { connectEnabled } from '@/lib/stripe/connect';
import { subscriptionsEnabled } from '@/lib/subscriptions';
import SettingsView from '../SettingsView';

export const dynamic = 'force-dynamic';

export default function PayoutsPage() {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <SettingsView connectEnabled={enabled} subscriptionsEnabled={subscriptionsEnabled()} section="payouts" />;
}

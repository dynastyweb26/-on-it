// /settings/payouts/<method> — one payout method's edit view (stripe, bank,
// zelle, cashapp, paypal, venmo). Same server wrapper as /settings/payouts.
import { notFound } from 'next/navigation';
import { connectEnabled } from '@/lib/stripe/connect';
import { isPayoutMethod } from '@/lib/payout-status';
import SettingsView from '../../SettingsView';

export const dynamic = 'force-dynamic';

export default function PayoutMethodPage({ params }: { params: { method: string } }) {
  if (!isPayoutMethod(params.method)) notFound();
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <SettingsView connectEnabled={enabled} section="payouts" method={params.method} />;
}

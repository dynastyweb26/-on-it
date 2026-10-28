// Server shell: the only job here is reading this deployment's Stripe switches
// before the client tree renders, so Settings paints its real state instead of
// flashing "Coming soon" (Connect) or an upgrade CTA that cannot work
// (subscriptions). Everything else lives in AppShell.
import { connectEnabled } from '@/lib/stripe/connect';
import { subscriptionsEnabled } from '@/lib/subscriptions';
import AppShell from '@/components/app/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return (
    <AppShell connectEnabled={enabled} subscriptionsEnabled={subscriptionsEnabled()}>
      {children}
    </AppShell>
  );
}

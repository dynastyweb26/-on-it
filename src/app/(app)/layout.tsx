// Server shell: the only job here is reading this deployment's Stripe switches
// before the client tree renders, so Settings paints its real state instead of
// flashing "Coming soon" (Connect) or an upgrade CTA that cannot work
// (subscriptions). Everything else lives in AppShell.
//
// AppErrorBoundary wraps the whole shell so a render crash logs its component
// stack (the route-level error.tsx only sees the error object).
import { connectEnabled } from '@/lib/stripe/connect';
import { subscriptionsEnabled } from '@/lib/subscriptions';
import { bankTrackingForEnv } from '@/lib/feature-flags';
import AppShell from '@/components/app/AppShell';
import AppErrorBoundary from '@/components/AppErrorBoundary';
import BankTrackingProvider from '@/components/bank/BankTrackingProvider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return (
    <AppErrorBoundary>
      <BankTrackingProvider enabled={bankTrackingForEnv(process.env.VERCEL_ENV)}>
        <AppShell connectEnabled={enabled} subscriptionsEnabled={subscriptionsEnabled()}>
          {children}
        </AppShell>
      </BankTrackingProvider>
    </AppErrorBoundary>
  );
}

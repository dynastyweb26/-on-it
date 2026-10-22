// Server shell: the only job here is reading the deployment's Stripe Connect
// switch before the client tree renders, so the Settings tab paints its real
// state instead of flashing "Coming soon". Everything else lives in AppShell.
import { connectEnabled } from '@/lib/stripe/connect';
import AppShell from '@/components/app/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <AppShell connectEnabled={enabled}>{children}</AppShell>;
}

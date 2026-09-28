// Settings — server wrapper. Reads the deployment's Stripe Connect switch on
// the server and hands it to the client view, so the Stripe card renders its
// real state on first paint (no "Coming soon" flash while a client fetch
// resolves). Same check as GET /api/connect/status: STRIPE_CONNECT_ENABLED
// === 'true' AND a secret key present. Fails closed — a missing/garbled env
// value is false. Deployment-level only; no user data is read here (auth and
// the profile stay in SettingsView, client-side, as before).
import { connectEnabled } from '@/lib/stripe/connect';
import SettingsView from './SettingsView';

// Read the env at request time, never frozen into a build-time prerender.
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const enabled = connectEnabled() && Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  return <SettingsView connectEnabled={enabled} />;
}

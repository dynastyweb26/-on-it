// Client-side view of Stripe Connect availability, for PDF rendering.
//
// Whether a PDF shows the "Card or Cash App Pay — pay online" line depends on
// two things the browser can't read from the profile alone:
//   1. Connect is switched on in THIS deployment (server env
//      STRIPE_CONNECT_ENABLED) — asked once via GET /api/connect/status, the
//      same probe Settings uses. Fails closed.
//   2. The pro's own account: connected, charges enabled, card switch on —
//      from the profile row (select('*')), mirrored server-side by the Connect
//      routes/webhooks.
// Both must hold, so production (Connect off) never advertises card payments
// on a PDF even if a profile carries flags.

let enabledPromise: Promise<boolean> | null = null;

/** Is Connect on in this deployment? One request per page load, cached. */
export function fetchConnectEnabled(): Promise<boolean> {
  if (!enabledPromise) {
    enabledPromise = fetch('/api/connect/status', { method: 'GET' })
      .then(async (r) => r.ok && (await r.json())?.enabled === true)
      .catch(() => false);
  }
  return enabledPromise;
}

interface ConnectProfileFields {
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  card_payments_enabled?: boolean | null;
}

/** The pay page would offer card / Cash App Pay for this pro right now. */
export function cardAvailableFor(profile: ConnectProfileFields | null | undefined, connectOn: boolean): boolean {
  return Boolean(
    connectOn &&
      profile?.stripe_account_id &&
      profile.stripe_charges_enabled &&
      profile.card_payments_enabled
  );
}

// Right-side status for each row on /settings/payouts. Pure, so the index and
// the tests share one source. Tone maps onto SettingsRow's valueTone:
//   default — a real configured value (••••5678, $handle, Connected)
//   muted   — nothing to act on yet ("Not set", "Off", "In review", "Coming soon")
//   error   — the seller has to do something ("Action needed")

export const PAYOUT_METHODS = ['stripe', 'bank', 'zelle', 'cashapp', 'paypal', 'venmo'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const isPayoutMethod = (v: string): v is PayoutMethod =>
  (PAYOUT_METHODS as readonly string[]).includes(v);

export interface PayoutStatus { text: string; tone: 'default' | 'muted' | 'error' }

const NOT_SET: PayoutStatus = { text: 'Not set', tone: 'muted' };
/** Still loading: blank, never "Not set" before the data has arrived. */
export const LOADING: PayoutStatus = { text: '', tone: 'muted' };

export interface StripeFields {
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_details_submitted?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  /** The seller's "Accept card payments" switch. */
  card_payments_enabled?: boolean | null;
}

/**
 * Priority (founder, 2026-10-16): Not connected > Action needed (only while the
 * card switch is on) > Off > Connected. Around it:
 *   Connect off in this deployment          → Coming soon
 *   no account                              → Not connected
 *   switch on, seller owes a detail         → Action needed
 *   switch on, payouts paused               → Action needed
 *   switch on, submitted, Stripe reviewing  → In review
 *   switch off                              → Off
 *   switch on, charging and paying out      → Connected
 */
export function stripeStatus(p: StripeFields, connectOn: boolean): PayoutStatus {
  if (!connectOn) return { text: 'Coming soon', tone: 'muted' };
  if (!p.stripe_account_id) return { text: 'Not connected', tone: 'muted' };
  if (!p.card_payments_enabled) return { text: 'Off', tone: 'muted' };
  if (!p.stripe_charges_enabled) {
    return p.stripe_details_submitted
      ? { text: 'In review', tone: 'muted' }
      : { text: 'Action needed', tone: 'error' };
  }
  if (!p.stripe_payouts_enabled) return { text: 'Action needed', tone: 'error' };
  return { text: 'Connected', tone: 'default' };
}

export function bankStatus(p: { bank_account_last4?: string | null; bank_transfer_enabled?: boolean | null }): PayoutStatus {
  if (!p.bank_account_last4) return NOT_SET;
  if (!p.bank_transfer_enabled) return { text: 'Off', tone: 'muted' };
  return { text: `••••${p.bank_account_last4}`, tone: 'default' };
}

/**
 * Zelle is encrypted at rest and has no plain "configured" column; the index
 * only ever has the mask from GET /api/zelle, which loads after the profile.
 *   undefined → not loaded yet (or the lookup failed): blank
 *   null / '' → loaded, nothing stored: Not set
 */
export function zelleStatus(masked: string | null | undefined): PayoutStatus {
  if (masked === undefined) return LOADING;
  return masked ? { text: masked, tone: 'default' } : NOT_SET;
}

const SIGIL = { cashapp: '$', paypal: '', venmo: '@' } as const;

/** Stored handles are bare (normalized on save); the row adds the method's sigil. */
export function handleStatus(method: keyof typeof SIGIL, handle: string | null | undefined): PayoutStatus {
  const h = handle?.trim();
  return h ? { text: `${SIGIL[method]}${h}`, tone: 'default' } : NOT_SET;
}

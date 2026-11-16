// ═══ RevenueCat subscriber state → what we store on a profile ═══
// Pure: the webhook hands this the JSON of GET /v1/subscribers/{app_user_id}
// (documented "Customer Info Model") and a clock, and it answers what the
// profile should say. No I/O, no Supabase, no clock of its own — every case in
// the fixture tests is one object in, one object out.
//
// Entitlements decide the plan (`plus` first — it also unlocks `pro`; then
// `pro`). A product id never does. `null` plan means "don't write it": nothing
// is active, and access_tier already decides what a lapsed profile may do.
//
// tier:  trial period → trialing · otherwise active · a billing issue inside
//        the grace period → past_due · nothing active → canceled.
// The subscriber endpoint has no "scheduled change" field at all; the webhook's
// PRODUCT_CHANGE event carries that (see scheduled-change.ts).
export type DerivedTier = 'trialing' | 'active' | 'past_due' | 'canceled';
export type DerivedStore = 'app_store' | 'play_store' | null;

export interface RevenueCatEntitlement {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
}

export interface RevenueCatSubscription {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  /** normal | trial | intro | promotional | prepaid (lowercase in the API). */
  period_type?: string | null;
  /** app_store | play_store | stripe | promotional | rc_billing | … */
  store?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}

export interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement> | null;
  subscriptions?: Record<string, RevenueCatSubscription> | null;
}

export interface DerivedState {
  tier: DerivedTier;
  plan: 'pro' | 'plus' | null;
  billingSource: DerivedStore;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
}

/** One line per thing that could not be used; the caller logs it. */
export type DeriveLog = (message: string, detail?: Record<string, unknown>) => void;

const KNOWN_ENTITLEMENTS = ['plus', 'pro'] as const;

const time = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};

/** The latest instant an entitlement is good for (a grace period extends it). */
function entitlementEnd(ent: RevenueCatEntitlement | undefined): string | null {
  const dates = [ent?.expires_date, ent?.grace_period_expires_date]
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => (time(b) ?? 0) - (time(a) ?? 0));
  return dates[0] ?? null;
}

function isActive(ent: RevenueCatEntitlement | undefined, now: number): boolean {
  const end = time(entitlementEnd(ent));
  return end != null && end > now;
}

function storeSource(store: string | null | undefined): DerivedStore {
  const s = String(store ?? '').toLowerCase();
  if (s === 'app_store') return 'app_store';
  if (s === 'play_store') return 'play_store';
  return null;
}

/** The subscription record behind an entitlement's product, if we have one. */
function subscriptionFor(
  subscriptions: Record<string, RevenueCatSubscription>,
  product: string | null | undefined,
): { product: string; sub: RevenueCatSubscription } | null {
  if (!product) return null;
  const exact = subscriptions[product];
  if (exact) return { product, sub: exact };
  // A Play/Billing product can be keyed with a plan suffix; match the bare id.
  const base = product.split(':')[0];
  const key = Object.keys(subscriptions).find((k) => k.split(':')[0] === base);
  return key ? { product: key, sub: subscriptions[key] } : null;
}

export function deriveRevenueCatState(
  subscriber: RevenueCatSubscriber | null | undefined,
  now: Date,
  log: DeriveLog = () => {},
): DerivedState {
  const at = now.getTime();
  const entitlements = subscriber?.entitlements ?? {};
  const subscriptions = subscriber?.subscriptions ?? {};

  // An entitlement id we don't sell: never active, always logged.
  for (const id of Object.keys(entitlements)) {
    if (!(KNOWN_ENTITLEMENTS as readonly string[]).includes(id)) log('unknown_entitlement', { id });
  }

  const plan = (() => {
    for (const candidate of KNOWN_ENTITLEMENTS) {
      const ent = entitlements[candidate];
      if (!isActive(ent, at)) continue;
      const found = subscriptionFor(subscriptions, ent?.product_identifier);
      if (!found) {
        // An active entitlement whose product we can't read: not enough to
        // grant a plan on, so treat it as not active (and say so).
        log('unknown_product', { entitlement: candidate, product: ent?.product_identifier ?? null });
        continue;
      }
      return { name: candidate as 'pro' | 'plus', ent: ent!, product: found.product, sub: found.sub };
    }
    return null;
  })();

  if (!plan) {
    // Nothing active: cancel access, leave the plan alone (null = don't write).
    // Ownership still records the store of the newest subscription when we can
    // see one, so a later event can't be claimed by the wrong side.
    const newest = Object.entries(subscriptions)
      .filter(([, sub]) => time(sub.expires_date) != null)
      .sort((a, b) => (time(b[1].expires_date) ?? 0) - (time(a[1].expires_date) ?? 0))[0];
    const source = newest ? storeSource(newest[1].store) : null;
    if (newest && !source) log('unknown_store', { product: newest[0], store: newest[1].store ?? null });
    return {
      tier: 'canceled',
      plan: null,
      billingSource: source,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
    };
  }

  const { ent, sub, product } = plan;
  const billingSource = storeSource(sub.store);
  if (!billingSource) log('unknown_store', { product, store: sub.store ?? null });

  const periodType = String(sub.period_type ?? '').toLowerCase();
  const tier: DerivedTier = sub.billing_issues_detected_at
    ? 'past_due'
    : periodType === 'trial'
      ? 'trialing'
      : 'active';

  // A scheduled change lives on the event, not here; the subscriber only has
  // the current product. cancel_at_period_end is its own fact.
  return {
    tier,
    plan: plan.name,
    billingSource,
    currentPeriodEnd: entitlementEnd(ent),
    cancelAtPeriodEnd: Boolean(sub.unsubscribe_detected_at),
    trialEndsAt: periodType === 'trial' ? entitlementEnd(ent) : null,
  };
}

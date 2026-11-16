// ═══ The RevenueCat webhook's decision core ═══
// Everything the route decides lives here with its I/O injected, so every case
// the founder listed (auth is separate) is a unit test: replayed event, unknown
// user, API failure, out-of-order events, founder untouched.
//
// The event is only a signal. The state is always fetched from the subscriber
// endpoint and derived (derive.ts), so the order two events arrive in cannot
// change the outcome — the last write reflects the live subscription.
import { deriveRevenueCatState, type DerivedState } from './derive';
import { nextPendingChange, type PendingChange } from './scheduled-change';

export const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_PAUSED',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'TEST',
  'TRANSFER',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RevenueCatEvent {
  id: string;
  type: string;
  appUserId: string;
  environment: string;
  store: string | null;
  newProductId: string | null;
  transferredFrom: string[];
  transferredTo: string[];
}

/** The documented payload, read defensively: `Sometimes` fields may be absent. */
export function parseEvent(payload: unknown): RevenueCatEvent | null {
  const body = payload as { event?: Record<string, unknown> } | null;
  const e = body?.event;
  if (!e || typeof e !== 'object') return null;
  const id = typeof e.id === 'string' ? e.id.trim() : '';
  const type = typeof e.type === 'string' ? e.type.trim() : '';
  if (!id || !type) return null;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  return {
    id,
    type: type.toUpperCase(),
    appUserId: typeof e.app_user_id === 'string' ? e.app_user_id : '',
    environment: typeof e.environment === 'string' ? e.environment.toUpperCase() : '',
    store: typeof e.store === 'string' ? e.store.toUpperCase() : null,
    newProductId: typeof e.new_product_id === 'string' ? e.new_product_id : null,
    transferredFrom: strings(e.transferred_from),
    transferredTo: strings(e.transferred_to),
  };
}

export type StoreSource = 'app_store' | 'play_store';

export interface ProfileForBilling {
  id: string;
  access_tier: string | null;
  billing_source: string | null;
  plan: string | null;
  plan_change_to: string | null;
  plan_change_at: string | null;
}

export interface RevenueCatDeps {
  /** Insert the event row (or find it); 'processed' means it is already done. */
  claimEvent(event: RevenueCatEvent): Promise<'claimed' | 'processed'>;
  markProcessed(eventId: string): Promise<void>;
  findProfile(userId: string): Promise<ProfileForBilling | null>;
  fetchSubscriber(userId: string): Promise<unknown>;
  /** Writes through the billing-source rule, founder-guarded. */
  writeProfile(args: {
    userId: string;
    source: StoreSource;
    fields: Record<string, unknown>;
  }): Promise<boolean>;
  log(message: string, detail?: Record<string, unknown>): void;
  now(): Date;
}

export interface ProcessResult {
  status: number;
  body: Record<string, unknown>;
}

/** The event's store, for a subscriber state that didn't name one. */
function storeFromEvent(store: string | null): StoreSource | null {
  if (store === 'APP_STORE') return 'app_store';
  if (store === 'PLAY_STORE') return 'play_store';
  return null;
}

function asPlan(value: string | null | undefined): 'pro' | 'plus' | null {
  return value === 'pro' || value === 'plus' ? value : null;
}

/** The profile fields one derived state means. */
export function fieldsFor(
  derived: DerivedState,
  profile: ProfileForBilling,
  event: RevenueCatEvent,
  log: (message: string, detail?: Record<string, unknown>) => void,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    access_tier: derived.tier,
    current_period_end: derived.currentPeriodEnd,
    cancel_at_period_end: derived.cancelAtPeriodEnd,
    trial_ends_at: derived.trialEndsAt,
  };
  // A null plan means "don't write it" (nothing active: access_tier decides).
  if (derived.plan) fields.plan = derived.plan;

  const pending: PendingChange = { to: asPlan(profile.plan_change_to), at: profile.plan_change_at ?? null };
  const next = nextPendingChange({
    eventType: event.type,
    newProductId: event.newProductId,
    derivedPlan: derived.plan,
    currentPeriodEnd: derived.currentPeriodEnd,
    pending,
  }, log);
  if (next.to !== pending.to || next.at !== pending.at) {
    fields.plan_change_to = next.to;
    fields.plan_change_at = next.at;
  }
  return fields;
}

const ok = (outcome: string, extra: Record<string, unknown> = {}): ProcessResult => ({
  status: 200,
  body: { received: true, outcome, ...extra },
});

/**
 * Handle one verified event. Returns the HTTP answer: 200 for anything that is
 * a no-op (unknown type, replay, unknown user, no store), 500 when RevenueCat
 * or the database failed, so RevenueCat retries.
 */
export async function processRevenueCatEvent(
  event: RevenueCatEvent,
  deps: RevenueCatDeps,
): Promise<ProcessResult> {
  if (!KNOWN_EVENT_TYPES.has(event.type)) {
    deps.log('unknown_event', { type: event.type });
    return ok('unknown_event');
  }

  let claim: 'claimed' | 'processed';
  try {
    claim = await deps.claimEvent(event);
  } catch (e) {
    deps.log('event_claim_failed', { eventId: event.id, message: (e as Error)?.message ?? 'unknown' });
    return { status: 500, body: { error: 'claim failed' } };
  }
  if (claim === 'processed') {
    deps.log('replayed_event', { eventId: event.id });
    return ok('replayed');
  }

  const targets = event.type === 'TRANSFER'
    ? [...new Set([...event.transferredFrom, ...event.transferredTo, event.appUserId])].filter(Boolean)
    : [event.appUserId];

  let synced = 0;
  let skipped = 0;
  try {
    for (const userId of targets) {
      if (!UUID_RE.test(userId)) {
        // Anonymous ids ($RCAnonymousID:…) are never ours: no purchase is
        // allowed without a signed-in user.
        deps.log('skipped_non_user_id', { appUserId: userId, eventType: event.type });
        skipped++;
        continue;
      }
      const profile = await deps.findProfile(userId);
      if (!profile) {
        deps.log('skipped_unknown_profile', { appUserId: userId, eventType: event.type });
        skipped++;
        continue;
      }
      // Always the live subscriber, never the event snapshot.
      const subscriber = await deps.fetchSubscriber(userId);
      const derived = deriveRevenueCatState(subscriber as never, deps.now(), (m, d) => deps.log(m, d));
      const source = derived.billingSource ?? storeFromEvent(event.store);
      if (!source) {
        deps.log('skipped_unknown_store', { appUserId: userId, store: event.store });
        skipped++;
        continue;
      }
      const fields = fieldsFor(derived, profile, event, (m, d) => deps.log(m, d));
      await deps.writeProfile({ userId, source, fields });
      synced++;
    }
    await deps.markProcessed(event.id);
    return ok('processed', { synced, skipped });
  } catch (e) {
    // RevenueCat API or database failure: 500 so the delivery is retried, and
    // processed_at stays unset so the retry does real work.
    deps.log('processing_failed', {
      eventId: event.id,
      type: event.type,
      message: (e as Error)?.message ?? 'unknown',
    });
    return { status: 500, body: { error: 'processing failed' } };
  }
}

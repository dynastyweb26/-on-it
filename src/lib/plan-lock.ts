// ═══ ON IT — the one plan lock (TIERS-SPEC.md rule 3, design/tiers 04) ═══
// A Plus-only action, refused, answers the same typed shape everywhere: which
// feature was locked, which plan opens it, and the plan the user is on now. The
// sheet renders from this object instead of matching strings, and a second paid
// plan is one edit here.
//
// The two halves:
//   - the server sends what it alone knows — { error, feature, planRequired }.
//     It never reads the profile again just to refuse (the recurring gate is a
//     SQL trigger and cannot send a body at all).
//   - the client completes it with the plan it already holds from /api/access,
//     through planLockFrom() / planLockFromCode(). Nothing guesses: an unknown
//     body or code is null, never a made-up lock.
//
// Pure: no DB, no React. Server routes import planLockBody(); client code
// imports the parsers.
import { entitlementsFor, type TierPlan } from './entitlements';

/** The error code every gate answers with (JSON body and JSON `error`). */
export const PLAN_REQUIRED = 'plan_required';

export type PlanFeature = 'bank' | 'recurring' | 'attachments';

export const PLAN_FEATURES: readonly PlanFeature[] = ['bank', 'recurring', 'attachments'];

/** The plan that opens each locked feature. Plus is the only one today. */
export const PLAN_REQUIRED_BY: Record<PlanFeature, Exclude<TierPlan, 'free'>> = {
  bank: 'plus',
  recurring: 'plus',
  attachments: 'plus',
};

/** Every spelling a gate can raise: the JSON code, the recurring trigger's two
 *  hints, and the attachment trigger's hint. One list, so the client maps them
 *  the same way. */
export const LOCK_CODES: readonly string[] = [
  PLAN_REQUIRED,
  'PLAN_RECURRING',
  'PAYWALL_RECURRING',
  'PLAN_ATTACHMENTS',
];

export interface PlanLock {
  error: 'plan_required';
  feature: PlanFeature;
  /** The plan that opens it. */
  planRequired: Exclude<TierPlan, 'free'>;
  /** The plan the user is on right now (the one that was refused). */
  plan: TierPlan;
}

/** What a route can answer without a second profile read. */
export type PlanLockBody = Pick<PlanLock, 'error' | 'feature' | 'planRequired'>;

export function planLockBody(feature: PlanFeature): PlanLockBody {
  return { error: PLAN_REQUIRED, feature, planRequired: PLAN_REQUIRED_BY[feature] };
}

/**
 * Is this feature locked for this (tier, plan) pair? Returns the lock, or null
 * when the plan already opens it. `entitlementsFor` decides — never a plan-name
 * compare here.
 */
export function planLock(
  feature: PlanFeature,
  tier: string | null | undefined,
  plan: string | null | undefined,
): PlanLock | null {
  const current = entitlementsFor(tier, plan);
  if (current.plan === 'plus') return null;
  return { error: PLAN_REQUIRED, feature, planRequired: PLAN_REQUIRED_BY[feature], plan: current.plan };
}

/** Does this response body carry the plan refusal? */
export function isPlanRefusalBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  const error = record.error ?? record.code;
  return typeof error === 'string' && error === PLAN_REQUIRED;
}

/** Does this thrown/returned code mean the plan refused it? */
export function isLockCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && LOCK_CODES.includes(code);
}

/**
 * The typed lock from a gate's response body, completed with the plan the
 * caller already holds. The feature comes from the call site, never from the
 * body: a response can never claim a different lock than the action it refused.
 */
export function planLockFrom(
  feature: PlanFeature,
  body: unknown,
  currentPlan: TierPlan,
): PlanLock | null {
  if (!isPlanRefusalBody(body)) return null;
  return { error: PLAN_REQUIRED, feature, planRequired: PLAN_REQUIRED_BY[feature], plan: currentPlan };
}

/** The same, for a gate that answers a code (a thrown error, a SQL hint). */
export function planLockFromCode(
  feature: PlanFeature,
  code: string | null | undefined,
  currentPlan: TierPlan,
): PlanLock | null {
  return isLockCode(code) ? planLockFrom(feature, { error: PLAN_REQUIRED }, currentPlan) : null;
}

// A store downgrade waits for renewal ("Plus until Dec 15, then Pro"). The
// subscriber endpoint has NO pending-change field, so the only signal is the
// PRODUCT_CHANGE event's `new_product_id`, mapped through the founder's four
// product ids (products.ts). Everything else about the change — when it lands —
// is the current paid period's end, taken from the derived subscriber state.
import { planForProduct, planRank, type StorePlan } from './products';

export interface PendingChange {
  to: 'pro' | 'plus' | null;
  at: string | null;
}

export interface ScheduledChangeInput {
  eventType: string;
  /** PRODUCT_CHANGE only; omitted from the payload when null. */
  newProductId: string | null | undefined;
  /** The plan the subscriber state says is live right now. */
  derivedPlan: StorePlan | null;
  /** The derived current period end — when a deferred change takes effect. */
  currentPeriodEnd: string | null;
  /** What the profile already says. */
  pending: PendingChange;
}

export type ChangeLog = (message: string, detail?: Record<string, unknown>) => void;

/**
 * The next pending change. Rules:
 *   • the derived plan reaching the pending plan means it landed → clear;
 *   • an unknown product id leaves the pair untouched (and is logged);
 *   • a PRODUCT_CHANGE to the SAME or a HIGHER plan is immediate (or an undo)
 *     → clear; only a LOWER plan is scheduled;
 *   • no period end to point at → leave the pair untouched (logged).
 */
export function nextPendingChange(input: ScheduledChangeInput, log: ChangeLog = () => {}): PendingChange {
  const { eventType, newProductId, derivedPlan, currentPeriodEnd, pending } = input;

  // Landed: the change is the plan that is now live.
  if (pending.to && derivedPlan === pending.to) return { to: null, at: null };

  if (eventType !== 'PRODUCT_CHANGE') return { to: pending.to, at: pending.at };

  const newPlan = planForProduct(newProductId);
  if (!newPlan) {
    log('unknown_product_id', { productId: newProductId ?? null });
    return { to: pending.to, at: pending.at };
  }
  if (!derivedPlan) return { to: pending.to, at: pending.at };

  // Upgrade (or an undo back to the current plan): immediate, nothing pending.
  if (planRank(newPlan) >= planRank(derivedPlan)) return { to: null, at: null };

  if (!currentPeriodEnd) {
    log('missing_period_end', { productId: newProductId ?? null });
    return { to: pending.to, at: pending.at };
  }
  return { to: newPlan, at: currentPeriodEnd };
}

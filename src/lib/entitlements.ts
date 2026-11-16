// ═══ ON IT — what a plan allows (TIERS-SPEC.md) ═══
// The ONE place a plan's limits are written. Pure: no server-only import, no
// DB, no React — /api/access reads it today and the server gates will read the
// same table when they land.
//
// Two inputs, because the two facts live apart on purpose:
//   tier — profiles.access_tier: does this user have access at all?
//   plan — profiles.plan: which paid plan they are on ('pro' | 'plus' | null).
// Access decides first. A paid tier whose plan is null (every subscription
// made before plans existed) or unrecognised is Pro. A founder is always Plus.
// Anything not paying is Free whatever the stored plan says — a canceled user
// keeps their plan value so a resubscribe restores it, but their access is the
// free limits until then.

export type TierPlan = 'free' | 'pro' | 'plus';

export interface Entitlements {
  plan: TierPlan;
  aiDailyLimit: 5 | 30 | 100;
  canBank: boolean;      // Plaid bank activity
  canRecurring: boolean; // new recurring expenses
  canAttach: boolean;    // new attachment uploads
  canExport: boolean;    // Income / Expense PDFs
  unlimitedDocs: boolean; // invoices, estimates and expenses have no free cap
}

type PlanLimits = Omit<Entitlements, 'plan'>;

/** TIERS-SPEC.md, "Plans". Free is today's behaviour (the SQL free_*_limit()
 *  functions); Pro and Plus are what the two paid plans open. */
const LIMITS: Record<TierPlan, PlanLimits> = {
  free: {
    aiDailyLimit: 5,
    canBank: false,
    canRecurring: false,
    canAttach: false,
    canExport: false,
    unlimitedDocs: false,
  },
  pro: {
    aiDailyLimit: 30,
    canBank: false,
    canRecurring: false,
    canAttach: false,
    canExport: true,
    unlimitedDocs: true,
  },
  plus: {
    aiDailyLimit: 100,
    canBank: true,
    canRecurring: true,
    canAttach: true,
    canExport: true,
    unlimitedDocs: true,
  },
};

/** Tiers that mean "this user pays" — the same set access.ts treats as paid
 *  (past_due is Stripe's dunning grace window). */
const PAID_TIERS: ReadonlySet<string> = new Set(['trialing', 'active', 'past_due']);

/** The plan a (tier, plan) pair resolves to. Founder wins outright. */
function planNameFor(tier: string | null | undefined, plan: string | null | undefined): TierPlan {
  if (tier === 'founder') return 'plus';
  if (tier && PAID_TIERS.has(tier)) return plan === 'plus' ? 'plus' : 'pro';
  return 'free';
}

/**
 * Everything one (tier, plan) pair may do. Both arguments are the raw stored
 * values, so an unknown tier, a missing plan or a legacy value can never throw
 * or produce an undefined limit — the worst case is Free, the safest answer.
 */
export function entitlementsFor(
  tier: string | null | undefined,
  plan: string | null | undefined,
): Entitlements {
  const name = planNameFor(tier, plan);
  return { plan: name, ...LIMITS[name] };
}

/** The one "is this pair on Plus?" test. A route that needs a Plus-only action
 *  asks this instead of comparing plan names itself. */
export function isPlusPlan(
  tier: string | null | undefined,
  plan: string | null | undefined,
): boolean {
  return entitlementsFor(tier, plan).plan === 'plus';
}

/** The plan name shown beside the Settings title. A founder reads "Founder"
 *  (they hold Plus through a code, not a purchase); everyone else reads the
 *  plan their access resolves to, so a canceled or unknown tier is "Free". */
export type PlanLabel = 'Free' | 'Pro' | 'Plus' | 'Founder';
export function planLabel(tier: string | null | undefined, plan: string | null | undefined): PlanLabel {
  if (tier === 'founder') return 'Founder';
  const name = entitlementsFor(tier, plan).plan;
  return name === 'plus' ? 'Plus' : name === 'pro' ? 'Pro' : 'Free';
}

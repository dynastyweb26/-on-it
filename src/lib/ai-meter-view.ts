// ═══ ON IT — what the AI meter and the AI limit card show (design/tiers 02, 03) ═══
// Pure decisions for the two chat pieces. No limit, price or plan name is
// written here: the numbers come from the server (/api/access, /api/ask) and
// the plans from lib/plan-catalog through /api/access's planCatalog.
import type { AiMeter } from './ai-limit';
import type { TierPlan } from './entitlements';
import type { PlanCatalog } from './plan-catalog';

/** Board 02: the meter shows at 3 or fewer left (same rule on every plan). A
 *  display threshold, not a plan limit. */
export const METER_SHOW_AT = 3;

export interface MeterLine {
  left: number;
  limit: number;
  /** What the line reads: "2 of 5 left today". */
  text: string;
  /** What a screen reader hears, once per change: "2 questions left today". */
  announce: string;
  /** 1 left: text-safe gold, weight 600. */
  last: boolean;
}

/** True once the owner's local midnight has passed: the count started over. */
export function meterExpired(m: Pick<AiMeter, 'resetsAt'>, now: Date): boolean {
  const at = Date.parse(m.resetsAt);
  return Number.isFinite(at) && now.getTime() >= at;
}

/** The meter line, or null when it stays hidden: 4+ left, 0 left (the limit
 *  card takes over), no numbers, or a day that has already reset. */
export function meterLine(m: AiMeter | null | undefined, now: Date): MeterLine | null {
  if (!m || meterExpired(m, now)) return null;
  const left = Math.max(0, m.limit - m.used);
  if (left === 0 || left > METER_SHOW_AT) return null;
  return {
    left,
    limit: m.limit,
    text: `${left} of ${m.limit} left today`,
    announce: `${left} ${left === 1 ? 'question' : 'questions'} left today`,
    last: left === 1,
  };
}

/** The meter after one ask outcome. A normal answer carries the new count; a
 *  refusal carries the spent one; anything else leaves the meter alone. */
export function nextMeter(
  prev: AiMeter | null,
  out: { kind: string; ai?: AiMeter; used?: number; limit?: number; resetsAt?: string },
): AiMeter | null {
  if (out.kind === 'ok' && out.ai) return out.ai;
  if (out.kind === 'limit' && typeof out.used === 'number' && typeof out.limit === 'number' && typeof out.resetsAt === 'string') {
    return { used: out.used, limit: out.limit, resetsAt: out.resetsAt };
  }
  return prev;
}

// ── Limit card ──────────────────────────────────────────────────────────────

export const LIMIT_COPY = {
  title: 'That’s today’s questions',
  reset: 'Back at midnight',
  plusMenu: 'You can still create invoices, estimates and expenses with +',
  /** The repeat send at the limit: the card again, collapsed to one line. */
  collapsed: 'That’s today’s questions. Back at midnight.',
} as const;

export const usedAllLine = (limit: number): string => `You’ve used all ${limit} questions for today.`;

export interface UpgradeRow {
  /** The plan the button opens. */
  plan: Exclude<TierPlan, 'free'>;
  /** "Pro gives you 30 a day" */
  label: string;
  /** "$9.99/mo" */
  price: string;
  /** "See Pro" from Free (the paywall), "Upgrade to Plus" from a paid plan. */
  cta: string;
}

/** "$9.99/mo" from whole cents. Formatting only: the price is the catalog's. */
export function monthlyPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}/mo`;
}

/** The upgrade row for someone on `plan`, or null when there is no plan above
 *  it (Plus, a founder) or the catalog is missing. */
export function upgradeFor(plan: TierPlan | null | undefined, catalog: PlanCatalog | null | undefined): UpgradeRow | null {
  if (!plan || !catalog?.plans?.length) return null;
  const at = catalog.plans.findIndex((p) => p.plan === plan);
  if (at < 0) return null;
  const next = catalog.plans[at + 1];
  if (!next || next.plan === 'free' || next.monthlyCents == null) return null;
  return {
    plan: next.plan,
    label: `${next.name} gives you ${next.limits.aiDailyLimit} a day`,
    price: monthlyPrice(next.monthlyCents),
    cta: plan === 'free' ? `See ${next.name}` : `Upgrade to ${next.name}`,
  };
}

/** Is a card for this day already in the thread? Then the next one is the
 *  collapsed one-line version. */
export function limitCardCollapsed(earlier: readonly { aiLimit?: { resetsAt: string } }[], resetsAt: string): boolean {
  return earlier.some((m) => m.aiLimit?.resetsAt === resetsAt);
}

/** The line above the paywall headline when the limit card opened it, in the
 *  board's pattern ("Free includes 3 invoices. You've used them."). */
export function aiPaywallReason(freeName: string, limit: number): string {
  return `${freeName} includes ${limit} AI questions a day. You’ve used them.`;
}

// ── /api/access ─────────────────────────────────────────────────────────────

export interface AccessTiers {
  meter: AiMeter | null;
  plan: TierPlan | null;
  catalog: PlanCatalog | null;
}

const PLANS: readonly TierPlan[] = ['free', 'pro', 'plus'];

/** The tiers facts in a GET /api/access body. Anything malformed reads as
 *  absent, and an absent meter never shows. */
export function tiersFromAccess(body: unknown): AccessTiers {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const used = o.aiUsedToday, limit = o.aiLimit, resetsAt = o.aiResetsAt;
  const meter = typeof used === 'number' && Number.isFinite(used) && used >= 0
    && typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
    && typeof resetsAt === 'string' && resetsAt
    ? { used: Math.floor(used), limit: Math.floor(limit), resetsAt }
    : null;
  const ent = o.entitlements as { plan?: unknown } | undefined;
  const plan = PLANS.includes(ent?.plan as TierPlan) ? (ent?.plan as TierPlan) : null;
  const cat = o.planCatalog as PlanCatalog | undefined;
  const catalog = cat && Array.isArray(cat.plans) && Array.isArray(cat.rows) ? cat : null;
  return { meter, plan, catalog };
}

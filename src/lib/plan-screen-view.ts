// ═══ ON IT — what Settings › Plan says (design/tiers 06) ═══
// Pure wording for the plan screen. Every fact comes from the server:
// planCard (lib/plan-card, through /api/access) for the plan, price, dates,
// pending change, manage link and the allowed actions; the catalog for plan
// names and prices; /api/access's counts for usage. Nothing here decides a
// plan, a limit or a price.
import type { PlanCard } from './plan-card';
import type { PlanCatalog } from './plan-catalog';
import { offerOf, usd } from './plan-lock-view';

/** "Dec 15": the board's short date. Formatting only. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type CardView =
  | { kind: 'founder'; title: string; sub: string }
  | { kind: 'free'; title: string; sub: string | null }
  | { kind: 'trial'; title: string; sub: string; then: string | null }
  | { kind: 'paid'; title: string; price: string | null; sub: string | null }
  | { kind: 'pending'; title: string };

/** The plan card (6A, 6B, 6C). */
export function planCardView(card: PlanCard, catalog: PlanCatalog | null | undefined, trialEligible: boolean): CardView {
  if (card.founder) {
    const plus = offerOf(catalog, 'plus');
    return { kind: 'founder', title: card.name, sub: `${plus?.name ?? card.name}, free forever` };
  }
  if (card.plan === 'free') {
    const pro = offerOf(catalog, 'pro');
    const from = pro && pro.monthlyCents != null ? `${pro.name} from ${usd(pro.monthlyCents)}/mo` : null;
    return {
      kind: 'free',
      title: card.name,
      sub: from ? (trialEligible ? `${from} · ${pro!.trialDays} days free` : from) : null,
    };
  }
  if (card.pendingChangeTo && card.pendingChangeAt) {
    const to = offerOf(catalog, card.pendingChangeTo)?.name ?? card.pendingChangeTo;
    return { kind: 'pending', title: `${card.name} until ${shortDate(card.pendingChangeAt)}, then ${to}` };
  }
  if (card.trialEndsAt) {
    // "Then $16.99/mo. Reminder on Nov 26." The reminder date is planCard's
    // (the real trial email), never worked out here; no date, no clause.
    const remind = shortDate(card.trialReminderAt);
    const then = [
      card.priceCents != null ? `Then ${usd(card.priceCents)}/mo.` : null,
      remind ? `Reminder on ${remind}.` : null,
    ].filter(Boolean).join(' ');
    return {
      kind: 'trial',
      title: card.name,
      sub: `Free trial · ends ${shortDate(card.trialEndsAt)}`,
      then: then || null,
    };
  }
  const renews = shortDate(card.renewalAt);
  return {
    kind: 'paid',
    title: card.name,
    price: card.priceCents != null ? usd(card.priceCents) : null,
    sub: renews ? `Renews ${renews}` : null,
  };
}

export interface UsageRow {
  key: 'ai' | 'invoices' | 'estimates' | 'expenses';
  label: string;
  used: number;
  limit: number;
  /** Bar width, 0–100. */
  pct: number;
  full: boolean;
  /** The line under the bar, or null. */
  note: string | null;
}

export interface UsageInput {
  aiUsedToday?: number | null;
  aiLimit?: number | null;
  invoiceCount?: number | null;
  invoiceLimit?: number | null;
  estimateCount?: number | null;
  estimateLimit?: number | null;
  expenseCount?: number | null;
  expenseLimit?: number | null;
}

function row(key: UsageRow['key'], label: string, used: number | null | undefined, limit: number | null | undefined, note: (full: boolean) => string | null): UsageRow | null {
  if (typeof limit !== 'number' || !(limit > 0)) return null;
  const u = typeof used === 'number' && used > 0 ? Math.floor(used) : 0;
  const full = u >= limit;
  return { key, label, used: u, limit, pct: Math.min(100, Math.floor((u / limit) * 100)), full, note: note(full) };
}

/**
 * The usage card. Free sees every cap it can hit (AI, invoices, estimates,
 * expenses); a paid plan or a founder sees only AI, the one limit left.
 */
export function usageRows(card: PlanCard, u: UsageInput, catalog: PlanCatalog | null | undefined): UsageRow[] {
  const aiLimit = u.aiLimit ?? null;
  if (card.plan !== 'free') {
    const ai = row('ai', 'AI questions today', u.aiUsedToday, aiLimit,
      () => `Invoices, estimates and expenses have no cap on ${card.founder ? (offerOf(catalog, 'plus')?.name ?? card.name) : card.name}.`);
    return ai ? [ai] : [];
  }
  const proName = offerOf(catalog, 'pro')?.name ?? null;
  const capNote = (full: boolean) => (full && proName ? `All used. ${proName} has no cap.` : null);
  return [
    row('ai', 'AI questions today', u.aiUsedToday, aiLimit, () => `Back to ${aiLimit} at midnight`),
    row('invoices', 'Invoices', u.invoiceCount, u.invoiceLimit, capNote),
    row('estimates', 'Estimates', u.estimateCount, u.estimateLimit, capNote),
    row('expenses', 'Expenses', u.expenseCount, u.expenseLimit, capNote),
  ].filter((r): r is UsageRow => r !== null);
}

export type PlanAction =
  | { kind: 'see-plans'; label: string }
  | { kind: 'upgrade'; label: string; caption: string | null }
  | { kind: 'switch-pro'; label: string; caption: string | null }
  | { kind: 'keep-plus'; label: string };

/** The one action (6A, 6B, 6C), from what planCard allows. */
export function planAction(card: PlanCard, catalog: PlanCatalog | null | undefined): PlanAction | null {
  const plus = offerOf(catalog, 'plus');
  const pro = offerOf(catalog, 'pro');
  if (card.founder) return null;
  if (card.plan === 'free') return { kind: 'see-plans', label: 'See plans' };
  if (card.canKeepPlus && plus) return { kind: 'keep-plus', label: `Keep ${plus.name}` };
  if (card.canUpgradeToPlus && plus) {
    return {
      kind: 'upgrade',
      label: `Upgrade to ${plus.name}`,
      caption: plus.monthlyCents != null
        ? `Bank, recurring, photos, ${plus.limits.aiDailyLimit} questions a day · ${usd(plus.monthlyCents)}/mo`
        : null,
    };
  }
  if (card.canSwitchToPro && pro) {
    const at = shortDate(card.renewalAt);
    return {
      kind: 'switch-pro',
      label: `Switch to ${pro.name}`,
      caption: at ? `Starts ${at}. You keep your photos, recurring expenses and bank.` : 'You keep your photos, recurring expenses and bank.',
    };
  }
  return null;
}

/** The store name beside "Manage subscription"; null for the web portal. */
export function manageLabel(card: PlanCard): string | null {
  if (!card.manage) return null;
  return card.manage.target === 'app_store' ? 'App Store' : card.manage.target === 'play_store' ? 'Google Play' : null;
}

export const PLAN_COPY = {
  yourPlan: 'YOUR PLAN',
  manage: 'Manage subscription',
  restore: 'Restore purchases',
  loadError: 'Couldn’t load your plan. Your subscription is fine.',
  retry: 'Retry',
  restoredNothing: 'Nothing to restore on this account.',
} as const;

/** The line above the paywall headline when Settings opened it. */
export const plansPaywallReason = (card: Pick<PlanCard, 'name'>): string => `You’re on ${card.name}.`;

// ── /api/access ─────────────────────────────────────────────────────────────

export interface PlanScreenData {
  card: PlanCard;
  catalog: PlanCatalog | null;
  trialEligible: boolean;
  usage: UsageInput;
}

/** The access body → the screen's data, or null when planCard is missing. */
export function planScreenData(body: unknown): PlanScreenData | null {
  const o = (body && typeof body === 'object' ? body : null) as Record<string, unknown> | null;
  const card = o?.planCard as PlanCard | undefined;
  if (!o || !card || typeof card !== 'object' || typeof card.plan !== 'string') return null;
  const cat = o.planCatalog as PlanCatalog | undefined;
  const num = (k: string) => (typeof o[k] === 'number' ? (o[k] as number) : null);
  return {
    card,
    catalog: cat && Array.isArray(cat.plans) ? cat : null,
    trialEligible: o.trialEligible === true,
    usage: {
      aiUsedToday: num('aiUsedToday'), aiLimit: num('aiLimit'),
      invoiceCount: num('invoiceCount'), invoiceLimit: num('invoiceLimit'),
      estimateCount: num('estimateCount'), estimateLimit: num('estimateLimit'),
      expenseCount: num('expenseCount'), expenseLimit: num('expenseLimit'),
    },
  };
}

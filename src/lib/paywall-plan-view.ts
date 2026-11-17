// ═══ ON IT — what paywall page 3 says (design/tiers 01) ═══
// Pure wording and decisions for the two-plan page. Plans, prices, trial days
// and the comparison rows come from the plan catalog (/api/access planCatalog);
// the entry line and preselected plan from lib/paywall-entry; the reminder
// lead time from lib/trial. Nothing here decides a limit, a price or a plan.
import type { TierPlan } from './entitlements';
import type { PlanCatalog, RowKey, RowValue } from './plan-catalog';
import type { PaywallEntry, PaywallTopLineKey } from './paywall-entry';
import type { PurchaseOutcome } from './subscription/start';
import { offerOf, usd } from './plan-lock-view';

export type PaidChoice = 'pro' | 'plus';

/** What /api/access tells the page about the free caps (null when unknown). */
export interface FreeCaps {
  invoices: number | null;
  estimates: number | null;
  expenses: number | null;
  ai: number | null;
}

const nameOf = (catalog: PlanCatalog | null | undefined, plan: TierPlan, fallback: string) =>
  offerOf(catalog, plan)?.name ?? fallback;

// ── The line above the headline ────────────────────────────────────────────

export interface TopLine { icon: string; text: string }

/** Board 1A/1B: the line above the headline, from the entry map's key. */
export function topLineFor(
  key: PaywallTopLineKey | null | undefined,
  catalog: PlanCatalog | null | undefined,
  caps: FreeCaps,
): TopLine | null {
  if (!key) return null;
  const free = nameOf(catalog, 'free', 'Free');
  const pro = nameOf(catalog, 'pro', 'Pro');
  const plus = nameOf(catalog, 'plus', 'Plus');
  const used = (n: number | null, what: string) =>
    n != null ? `${free} includes ${n} ${what}. You’ve used them.` : `You’ve used your free ${what}.`;
  switch (key) {
    case 'limit.invoice': return { icon: 'description', text: used(caps.invoices, 'invoices') };
    case 'limit.estimate': return { icon: 'request_quote', text: used(caps.estimates, 'estimates') };
    case 'limit.expense': return { icon: 'receipt_long', text: used(caps.expenses, 'expenses') };
    case 'lock.bank':
    case 'lock.bank.moveUp': return { icon: 'account_balance', text: `Connecting a bank is part of ${plus}.` };
    case 'lock.recurring':
    case 'lock.recurring.moveUp': return { icon: 'event_repeat', text: `Recurring expenses are part of ${plus}.` };
    case 'lock.photos':
    case 'lock.photos.moveUp': return { icon: 'add_photo_alternate', text: `Adding photos is part of ${plus}.` };
    case 'reports': return { icon: 'description', text: `Income and expense PDFs are part of ${pro}.` };
    case 'recaps': return { icon: 'auto_stories', text: `Every recap is part of ${pro}.` };
    case 'ai.limit.free': return { icon: 'forum', text: caps.ai != null ? `${free} includes ${caps.ai} AI questions a day. You’ve used them.` : 'You’ve used today’s AI questions.' };
    case 'ai.limit.pro': return { icon: 'forum', text: caps.ai != null ? `${pro} includes ${caps.ai} AI questions a day. You’ve used them.` : 'You’ve used today’s AI questions.' };
    default: return null;
  }
}

// ── Plan cards ───────────────────────────────────────────────────────────────

export interface PlanCardView {
  plan: PaidChoice;
  name: string;
  price: string;
  blurb: string;
  /** "14-day free trial", or null for a returning customer. */
  chip: string | null;
}

const BLURB: Record<PaidChoice, (pro: string) => string> = {
  pro: () => 'No caps on invoices, estimates and expenses. PDFs of your books.',
  plus: (pro) => `Everything in ${pro}, plus your bank, recurring expenses and photos.`,
};

export function planCards(catalog: PlanCatalog | null | undefined, trialEligible: boolean): PlanCardView[] {
  const pro = nameOf(catalog, 'pro', 'Pro');
  return (['pro', 'plus'] as const).flatMap((plan) => {
    const o = offerOf(catalog, plan);
    if (!o || o.monthlyCents == null) return [];
    return [{
      plan,
      name: o.name,
      price: usd(o.monthlyCents),
      blurb: BLURB[plan](pro),
      chip: trialEligible ? `${o.trialDays}-day free trial` : null,
    }];
  });
}

/** Board 1A: the headline and the line under it. */
export function headline(viewerPlan: TierPlan, catalog: PlanCatalog | null | undefined, trialEligible: boolean): { title: string; sub: string | null } {
  if (viewerPlan === 'pro') return { title: `Move up to ${nameOf(catalog, 'plus', 'Plus')}`, sub: null };
  const days = offerOf(catalog, 'pro')?.trialDays;
  return { title: 'Pick your plan', sub: trialEligible && days ? `Both start with ${days} days free.` : null };
}

// ── What Plus adds to Pro (1B) ───────────────────────────────────────────────

export interface AddsRow { icon: string; label: string; from?: string; to?: string }

export function plusAdds(catalog: PlanCatalog | null | undefined): AddsRow[] {
  const pro = offerOf(catalog, 'pro');
  const plus = offerOf(catalog, 'plus');
  const rows: AddsRow[] = [
    { icon: 'account_balance', label: 'Bank activity in Books' },
    { icon: 'event_repeat', label: 'Recurring expenses' },
    { icon: 'photo_library', label: 'Photos on invoices and estimates' },
  ];
  if (pro && plus) rows.push({ icon: 'forum', label: 'AI questions a day', from: String(pro.limits.aiDailyLimit), to: String(plus.limits.aiDailyLimit) });
  return rows;
}

// ── The comparison table ─────────────────────────────────────────────────────

/** The board's own row labels (the screen's wording), by catalog row key. */
const ROW_LABEL: Record<RowKey, string> = {
  invoices: 'Invoices',
  estimates: 'Estimates',
  expenses: 'Expenses',
  recaps: 'Recaps',
  reports: 'Income & expense PDFs',
  ai: 'AI questions a day',
  bank: 'Bank activity',
  recurring: 'Recurring expenses',
  attachments: 'Photos on invoices & estimates',
};

export type Cell = { kind: 'icon'; icon: 'check' | 'remove' | 'all_inclusive'; label: string } | { kind: 'text'; text: string };

const FREE_CAP_KEY: Partial<Record<RowKey, keyof FreeCaps>> = { invoices: 'invoices', estimates: 'estimates', expenses: 'expenses' };

function cellFor(key: RowKey, v: RowValue, caps: FreeCaps): Cell {
  switch (v.kind) {
    case 'yes': return { kind: 'icon', icon: 'check', label: 'Included' };
    case 'no': return { kind: 'icon', icon: 'remove', label: 'Not included' };
    case 'unlimited': return key === 'recaps' ? { kind: 'text', text: 'All' } : { kind: 'icon', icon: 'all_inclusive', label: 'No cap' };
    case 'count': return { kind: 'text', text: key === 'recaps' ? `${v.count} weekly` : String(v.count) };
    case 'free': {
      const capKey = FREE_CAP_KEY[key];
      const n = capKey ? caps[capKey] : null;
      return { kind: 'text', text: n != null ? String(n) : 'Limited' };
    }
  }
}

export interface TableRow { key: RowKey; label: string; free: Cell; pro: Cell; plus: Cell }

export function tableRows(catalog: PlanCatalog | null | undefined, caps: FreeCaps): TableRow[] {
  return (catalog?.rows ?? []).map((r) => ({
    key: r.key,
    label: ROW_LABEL[r.key] ?? r.label,
    free: cellFor(r.key, r.free, caps),
    pro: cellFor(r.key, r.pro, caps),
    plus: cellFor(r.key, r.plus, caps),
  }));
}

// ── The reminder line (decided: no toggle) ───────────────────────────────────

export const reminderLine = (days: number): string => `We’ll remind you ${days} days before your trial ends.`;
export const CODE_ROW = 'Founder or invite code';

// ── The CTA block ────────────────────────────────────────────────────────────

export interface CtaView {
  label: string;
  /** Under the button: "then $9.99 / month, cancel anytime". */
  sub: string | null;
  /** Bottom row, beside Restore. */
  renews: string;
  /** The legal line in the page (above the fold on phone, below on laptop). */
  legal: string;
}

/**
 * The button and its lines for the selected plan. The store wording ("App
 * Store") is only said by the native build; the web says what Stripe does.
 */
export function ctaFor(input: {
  viewerPlan: TierPlan;
  selected: PaidChoice;
  catalog: PlanCatalog | null | undefined;
  trialEligible: boolean;
  native: boolean;
  /** The trial's end, formatted ("Dec 1"), for the web disclosure. */
  freeUntil?: string | null;
}): CtaView | null {
  const o = offerOf(input.catalog, input.selected);
  if (!o || o.monthlyCents == null) return null;
  const price = usd(o.monthlyCents);
  const where = input.native ? ' in the App Store' : '';
  if (input.viewerPlan === 'pro') {
    return {
      label: `Upgrade to ${o.name}`,
      sub: `You pay only the difference for the days left this month. ${o.name} opens right away.`,
      renews: `Then ${price}/mo${where}.`,
      legal: input.native
        ? 'Payment is charged to your App Store account. The subscription renews monthly unless you cancel at least 24 hours before the period ends.'
        : `${price}/month, renews monthly until you cancel. Cancel anytime in Settings.`,
    };
  }
  if (input.trialEligible) {
    return {
      label: `Start ${o.trialDays}-day free trial`,
      sub: `then ${price} / month, cancel anytime`,
      renews: `Renews monthly${where} until you cancel.`,
      legal: input.native
        ? 'Payment is charged to your App Store account when the trial ends. The subscription renews monthly unless you cancel at least 24 hours before the period ends.'
        : `${input.freeUntil ? `Free until ${input.freeUntil}.` : 'Nothing charged today.'} Then ${price}/month, renews monthly until you cancel. Cancel anytime in Settings.`,
    };
  }
  // A returning customer keeps today's Subscribe wording (founder, 2026-11-16).
  return {
    label: `Subscribe — ${price}/month`,
    sub: null,
    renews: `Renews monthly${where} until you cancel.`,
    legal: input.native
      ? 'Payment is charged to your App Store account today. The subscription renews monthly unless you cancel at least 24 hours before the period ends.'
      : `${price}/month starts today, renews monthly until you cancel. Cancel anytime in Settings.`,
  };
}

// ── Pay state (the CTA's states, board "CTA · all states") ───────────────────

export type PayState = 'idle' | 'pending' | 'confirming' | 'slow' | 'failed' | 'success';

/** The page state a purchase outcome moves to. `cancelled` lands on idle, silently. */
export function payStateFor(out: PurchaseOutcome): PayState {
  switch (out.status) {
    case 'cancelled': return 'idle';
    case 'pending': return 'pending';
    case 'confirming': return 'confirming';
    case 'slow': return 'slow';
    case 'failed': return 'failed';
    case 'success': return 'success';
  }
}

/** Repeat taps are ignored while pending or confirming (no second store sheet). */
export const canBuy = (s: PayState): boolean => s === 'idle' || s === 'failed';

/** The picker freezes (55%) while a purchase is in flight. */
export const pickerFrozen = (s: PayState): boolean => s === 'pending' || s === 'confirming' || s === 'slow';

export const CONFIRM_COPY = {
  confirming: 'Confirming your purchase...',
  storeSaidYes: 'The App Store said yes. Waiting on our server.',
  slow: 'Taking longer than usual. You won’t be charged twice.',
  tryAgain: 'Try again',
  restore: 'Restore',
  restorePurchases: 'Restore purchases',
  yourPlan: 'Your plan',
  opensNow: 'Opens right away',
} as const;

/** 1B: the heading over what the higher plan adds. */
export function plusAddsTitle(catalog: PlanCatalog | null | undefined): string {
  return `WHAT ${nameOf(catalog, 'plus', 'Plus').toUpperCase()} ADDS TO ${nameOf(catalog, 'pro', 'Pro').toUpperCase()}`;
}

/** Which entry opened the wall, defaulting by variant for callers that only pass one. */
export function entryForVariant(variant: string): PaywallEntry | null {
  switch (variant) {
    case 'invoice': return 'invoice';
    case 'estimate': return 'estimate';
    case 'expense': return 'expense';
    case 'recurring': return 'recurring';
    case 'reports': return 'pdfs';
    case 'recaps': return 'recaps';
    case 'winback': return 'winback';
    default: return null;
  }
}

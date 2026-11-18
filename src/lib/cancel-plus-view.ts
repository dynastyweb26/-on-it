// ═══ ON IT — the cancel flow's two-plan additions (design/tiers 07) ═══
// Pure wording for a Plus user's offers. Which offers exist is
// cancelOffersFor's (lib/subscription/offers); prices are the catalog's,
// including the store's fixed retention price (planCatalog.retentionOffer,
// never 16.99 × 50% worked out here); dates are planCard's.
import type { PlanCatalog } from './plan-catalog';
import type { CancelOffer } from './subscription/offers';
import { offerOf, usd } from './plan-lock-view';
import { shortDate } from './plan-screen-view';

export type PlusChoice = 'switch_pro' | 'discount';

export interface PlusOfferCard {
  kind: PlusChoice;
  title: string;
  price: string;
  per: string;
  body: string;
}

/** 7A: when a Plus user picks "Too expensive", the two cards (pick one). */
export function plusPriceStep(offers: readonly CancelOffer[]): boolean {
  return offers.includes('switch_pro') && offers.includes('discount');
}

/** 7B: "Slow season" where the store can't pause: the Pro switch alone. */
export function plusSeasonalSwitch(offers: readonly CancelOffer[]): boolean {
  return offers.length === 1 && offers[0] === 'switch_pro';
}

export const SEVEN_A = {
  title: 'Two ways to pay less',
  sub: 'Pick one. Either keeps your invoices, clients and books right where they are.',
  cancelAnyway: 'Cancel anyway',
} as const;

/** The two cards, Switch to Pro first (it is preselected). */
export function plusOfferCards(catalog: PlanCatalog | null | undefined, renewalAt: string | null): PlusOfferCard[] {
  const pro = offerOf(catalog, 'pro');
  const plus = offerOf(catalog, 'plus');
  const r = catalog?.retentionOffer;
  const from = shortDate(renewalAt);
  const cards: PlusOfferCard[] = [];
  if (pro && pro.monthlyCents != null) {
    cards.push({
      kind: 'switch_pro',
      title: `Switch to ${pro.name}`,
      price: usd(pro.monthlyCents),
      per: from ? `/mo from ${from}` : '/mo',
      body: 'Unlimited invoices, estimates and expenses stay. Your photos, recurring expenses and bank stay too; adding new ones stops.',
    });
  }
  if (r && plus) {
    cards.push({
      kind: 'discount',
      title: `${r.percentOff}% off your next ${r.months} months`,
      price: usd(r.monthlyCents),
      per: `/mo, then ${usd(r.thenCents)}`,
      body: `Keep everything in ${plus.name}.`,
    });
  }
  return cards;
}

/** The CTA follows the selection ("Take 50% off"). */
export function plusOfferCta(choice: PlusChoice, catalog: PlanCatalog | null | undefined): string {
  if (choice === 'discount') {
    const pct = catalog?.retentionOffer?.percentOff;
    return pct ? `Take ${pct}% off` : 'Take the discount';
  }
  return `Switch to ${offerOf(catalog, 'pro')?.name ?? 'Pro'}`;
}

/** Success: "You're set. Pro starts Dec 15." */
export function switchedLine(catalog: PlanCatalog | null | undefined, renewalAt: string | null): string {
  const pro = offerOf(catalog, 'pro')?.name ?? 'Pro';
  const at = shortDate(renewalAt);
  return at ? `You’re set. ${pro} starts ${at}.` : `You’re set. ${pro} starts at your next renewal.`;
}

/** 7B: the card that replaces pause where the store has none. */
export function seasonalSwitchCard(catalog: PlanCatalog | null | undefined, renewalAt: string | null): { title: string; body: string } | null {
  const pro = offerOf(catalog, 'pro');
  const plus = offerOf(catalog, 'plus');
  if (!pro || !plus || pro.monthlyCents == null) return null;
  const from = shortDate(renewalAt);
  return {
    title: `Drop to ${pro.name} for the quiet months`,
    body: `${usd(pro.monthlyCents)}/mo${from ? ` from ${from}` : ''}. Move back to ${plus.name} any time, it opens right away.`,
  };
}

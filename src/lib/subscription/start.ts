// ═══ The purchase action ═══
// ONE interface starts every plan action, so the shape of the wall doesn't
// decide how you pay. Today it asks POST /api/checkout for a Stripe hosted
// Checkout URL and sends the browser there. When the stores land, the native
// adapter behind this same interface is the only thing that changes: the
// paywall, Settings > Plan and the cancel screen call purchases.start(plan),
// purchases.upgrade(), purchases.switchToPro(), purchases.keepPlus(),
// purchases.restore() and purchases.manage() — never Stripe, never a price.
//
// Not a Server Action and not 'use client' — a plain browser module. Callers
// are client components; the server side (/api/checkout, /api/billing-portal)
// is untouched.
//
// The outcome is typed, because the user has to be told the truth:
//   pending    the payment sheet has the browser (nothing else to do)
//   confirming the store said yes and the server hasn't yet (see confirm.ts)
//   slow       still not confirmed after 20s; retry re-asks, never re-buys
//   cancelled  the user backed out; back to idle, no message
//   success    the server confirmed the plan
//   failed     a named cause, and the message the wall shows inline
//
// No $16.99 Stripe price exists: Plus is sold only in the app stores, so on the
// web anything Plus answers `store_only`. Nothing here charges anyone.
import { RESTORE_UNAVAILABLE, restorePurchases } from './restore';

/** Where Checkout returns to (POST /api/checkout's whitelist): the screen that
 *  showed the wall, so a blocked invoice card or expense is right there. */
export type CheckoutReturn = 'chat' | 'summary' | 'books' | 'invoices' | 'recurring' | 'settings';

export type StartOutcome =
  | { started: true }
  | { started: false; message: string };

/** Shown when the server says nothing useful (a 500, a dropped connection). */
export const START_UNAVAILABLE = 'Payments aren’t live yet — hang tight.';

/** The plans a purchase can name. Free is what everyone has. */
export type PurchasePlan = 'pro' | 'plus';

/** The one typed result every plan action returns. */
export type PurchaseOutcome =
  | { status: 'cancelled' }
  | { status: 'pending' }
  | { status: 'confirming' }
  /** `retry` on the confirm wait re-asks the server; it never re-buys. */
  | { status: 'slow' }
  | { status: 'failed'; cause: PurchaseFailure; message: string }
  /** plan is null when it restored but this build can't read which plan yet. */
  | { status: 'success'; plan: PurchasePlan | null };

/** Why a plan action failed. The screen picks its wording from the cause. */
export type PurchaseFailure =
  /** Plus on the web: it is sold only through the stores. Nothing charged. */
  | 'store_only'
  | 'billing_not_configured'
  | 'signed_out'
  | 'rate_limited'
  | 'no_subscription'
  | 'not_eligible'
  | 'unavailable';

/** Shown on the web for any Plus action (no $16.99 Stripe price is built). */
export const PLUS_STORE_ONLY = 'Plus is only available in the On It app. Nothing was charged.';

/** The one purchase interface. Every plan action goes through it, on every
 *  platform, so no screen needs to know which billing system answers. */
export interface Purchases {
  readonly source: 'web' | 'native';
  /** Start a plan. Pro is today's Stripe checkout; Plus is store-only. */
  start(plan: PurchasePlan, opts?: { returnTo?: CheckoutReturn }): Promise<PurchaseOutcome>;
  /** Pro → Plus, starting now (the store prorates it). */
  upgrade(opts?: { returnTo?: CheckoutReturn }): Promise<PurchaseOutcome>;
  /** Plus → Pro at the end of the paid period (no refund). */
  switchToPro(): Promise<PurchaseOutcome>;
  /** Undo a pending switch to Pro: stay on Plus. */
  keepPlus(): Promise<PurchaseOutcome>;
  restore(): Promise<PurchaseOutcome>;
  manage(): Promise<PurchaseOutcome>;
}

type ServerAnswer = { url: string | null; message: string; error: string | null };

/** POST a body, read either a destination URL or the server's message/error. */
async function askForUrl(path: string, body: unknown, fallback = START_UNAVAILABLE): Promise<ServerAnswer> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => null)) as
      { url?: unknown; message?: unknown; error?: unknown } | null;
    return {
      url: typeof data?.url === 'string' ? data.url : null,
      message: typeof data?.message === 'string' ? data.message : fallback,
      error: typeof data?.error === 'string' ? data.error : null,
    };
  } catch {
    return { url: null, message: fallback, error: null };
  }
}

/** The routes' `error` codes → the typed cause the screen switches on. */
const CAUSES: Readonly<Record<string, PurchaseFailure>> = {
  billing_not_configured: 'billing_not_configured',
  unauthorized: 'signed_out',
  rate_limited: 'rate_limited',
  no_subscription: 'no_subscription',
  not_eligible: 'not_eligible',
};

const causeOf = (error: string | null): PurchaseFailure =>
  error !== null && Object.hasOwn(CAUSES, error) ? CAUSES[error] : 'unavailable';

/** Hand the browser to a hosted page (Checkout, the billing portal). */
async function handOver(path: string, body: unknown, fallback?: string): Promise<PurchaseOutcome> {
  const answer = await askForUrl(path, body, fallback);
  if (answer.url) {
    // Stripe hosted Checkout / Billing Portal — or, later, whatever the
    // provider hands back.
    window.location.href = answer.url;
    return { status: 'pending' };
  }
  return { status: 'failed', cause: causeOf(answer.error), message: answer.message };
}

const storeOnly = (): PurchaseOutcome => ({ status: 'failed', cause: 'store_only', message: PLUS_STORE_ONLY });

/**
 * The web adapter. Pro runs through today's Stripe start, unchanged. Plus is
 * not sold on the web at all, so every Plus action (and every action whose
 * subject is a Plus plan) answers `store_only` — the same typed shape the
 * native adapter returns, so the screen has one code path.
 */
export const webPurchases: Purchases = {
  source: 'web',

  start(plan, opts = {}) {
    if (plan !== 'pro') return Promise.resolve(storeOnly());
    return handOver('/api/checkout', { returnTo: opts.returnTo ?? 'settings' });
  },

  // Plus starts now: store only.
  upgrade: () => Promise.resolve(storeOnly()),

  // A downgrade from Plus: only a store-owned Plus plan can be on the web,
  // and Plus is never sold there, so there is nothing for this adapter to do.
  switchToPro: () => Promise.resolve(storeOnly()),

  keepPlus: () => Promise.resolve(storeOnly()),

  async restore() {
    const outcome = await restorePurchases();
    if (outcome === 'restored') return { status: 'success', plan: null };
    if (outcome === 'nothing') return { status: 'cancelled' };
    return { status: 'failed', cause: 'store_only', message: RESTORE_UNAVAILABLE };
  },

  // Today's manage path: the Stripe hosted Billing Portal.
  manage: () => handOver('/api/billing-portal', {}, 'Billing management isn’t available yet.'),
};

/** What the UI imports. The native wrap swaps this for the store adapter. */
export const purchases: Purchases = webPurchases;

/**
 * Start the subscription from `returnTo`. Never throws — any failure becomes a
 * message the wall displays. Safe to call once per tap; the caller owns the
 * busy state. Kept as the wall's own entry point (it predates `purchases`);
 * both post the identical request.
 */
export async function startSubscription(returnTo: CheckoutReturn): Promise<StartOutcome> {
  const answer = await askForUrl('/api/checkout', { returnTo });
  if (answer.url) {
    window.location.href = answer.url;
    return { started: true };
  }
  return { started: false, message: answer.message };
}

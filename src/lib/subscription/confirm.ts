// ═══ Server-confirm wait ═══
// The store (or Stripe) says the purchase went through; the SERVER has not
// written profiles.plan yet. The screen waits for the server, never guesses
// (TIERS-SPEC: "Plus features open as soon as the billing webhook writes
// profiles.plan; the screen waits for that"). This is that wait, pure: the
// fetch and the timer are injected, so every branch is a unit test.
//
//   poll       every 1s, reading the account's plan from GET /api/access
//   20s        still nothing → 'slow': the CTA shows "Try again"
//   retry      asks the server again; it never re-opens a store sheet
//   cancel     the wall closed: the wait stops, no more reads
//
// Repeat taps are ignored structurally: a second start() or retry() while a
// wait is in flight returns that same wait instead of starting a second one.
import type { PurchaseOutcome, PurchasePlan } from './start';
import { entitlementsFor } from '../entitlements';

/** How often the server is asked. */
export const CONFIRM_INTERVAL_MS = 1000;
/** After this long, the screen offers "Try again". */
export const CONFIRM_SLOW_MS = 20000;

/** The one fetch shape this module needs (a real fetch satisfies it). */
export type FetchLike = (
  input: string,
  init?: { method?: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export type ConfirmDeps = {
  /** Injected so a test never touches the network. */
  fetch: FetchLike;
  /** Injected so a test never waits (it advances its own clock instead). */
  sleep: (ms: number) => Promise<void>;
  /** Injected so "20 seconds" is measurable. Defaults to Date.now. */
  now?: () => number;
  /** The plan that was bought. Set, the wait succeeds only once the server
   *  shows it (a Pro user buying Plus is already "paid" on the first read).
   *  Unset, any paid plan is success (today's Pro start). */
  expect?: PurchasePlan;
};

/** The wait's answer. `confirming` is the in-flight state the caller shows. */
export type ConfirmOutcome =
  | Extract<PurchaseOutcome, { status: 'success' }>
  | { status: 'slow' }
  | { status: 'cancelled' };

export interface PlanConfirmation {
  /** After the store said yes. Repeat calls return the SAME wait. */
  start(): Promise<ConfirmOutcome>;
  /** "Try again": re-asks the server. Never re-buys. Repeat calls are ignored. */
  retry(): Promise<ConfirmOutcome>;
  /** The wall closed: stop reading. The in-flight wait answers `cancelled`. */
  cancel(): void;
  /** Is a wait in flight? (For the caller's busy ref.) */
  readonly waiting: boolean;
}

/** The plan in a GET /api/access body: entitlements.plan, else the tier
 *  through entitlementsFor. Free (or nothing readable) is null. */
export function planOf(body: unknown): PurchasePlan | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as { entitlements?: { plan?: unknown }; tier?: unknown };
  const fromEnt = o.entitlements?.plan;
  if (fromEnt === 'pro' || fromEnt === 'plus') return fromEnt;
  if (fromEnt === 'free') return null;
  if (typeof o.tier !== 'string') return null;
  const p = entitlementsFor(o.tier, null).plan;
  return p === 'free' ? null : p;
}

/** One read per second, and the read at 20s decides. Bounded, so a frozen
 *  clock can never spin. */
const MAX_POLLS = Math.ceil(CONFIRM_SLOW_MS / CONFIRM_INTERVAL_MS) + 1;

export function createPlanConfirmation(deps: ConfirmDeps): PlanConfirmation {
  const now = deps.now ?? (() => Date.now());
  let running: Promise<ConfirmOutcome> | null = null;
  let cancelled = false;

  /** The account's plan, or null while the server hasn't written it yet.
   *  A failed read counts as "not yet": the poll carries on. */
  async function readPlan(): Promise<PurchasePlan | null> {
    try {
      const res = await deps.fetch('/api/access', { method: 'GET' });
      if (!res.ok) return null;
      const body = (await res.json()) as unknown;
      // /api/access has no top-level plan: the plan is entitlements.plan
      // (lib/entitlements). An older body without it falls back to the tier,
      // through the same entitlementsFor the server uses (founder = Plus).
      const plan = planOf(body);
      if (plan === 'plus' || plan === 'pro') return plan;
      return null;
    } catch {
      return null;
    }
  }

  async function poll(): Promise<ConfirmOutcome> {
    const startedAt = now();
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      if (cancelled) return { status: 'cancelled' };
      const plan = await readPlan();
      // With a plan bought, only that plan is success; Plus also covers a Pro
      // expectation (it unlocks Pro). Anything short of it is "not yet".
      if (plan && (!deps.expect || plan === deps.expect || plan === 'plus')) return { status: 'success', plan };
      if (now() - startedAt >= CONFIRM_SLOW_MS) return { status: 'slow' };
      await deps.sleep(CONFIRM_INTERVAL_MS);
    }
    return { status: 'slow' };
  }

  function begin(): Promise<ConfirmOutcome> {
    if (running) return running; // repeat tap: the same wait, no second poll
    cancelled = false;
    const tracked: Promise<ConfirmOutcome> = poll().then(
      (outcome) => { running = null; return outcome; },
      (error: unknown) => { running = null; throw error; },
    );
    running = tracked;
    return tracked;
  }

  return {
    start: begin,
    retry: begin,
    cancel() { cancelled = true; },
    get waiting() { return running !== null; },
  };
}

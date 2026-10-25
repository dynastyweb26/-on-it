// ═══ Soft upgrade prompts ═══
// The quiet, dismissible upgrade moments. Nothing here blocks anything — the
// walls are the paywall (PaywallModal); these are a small word at a moment that
// already happened. Each prompt carries its OWN copy, its own frequency cap and
// its own dismissal key, so one can never eat another's.
//
//   usage              free / canceled, 2 of 3 invoices or estimates → chat card
//   estimate-approved  free / canceled, an estimate was signed      → estimate screen
//   first-payment      free / canceled, their first ledger payment  → app banner
//   winback            canceled, once per 14 days                   → app banner
//   trial-ending       trialing, 3 days or fewer left, once a day    → app banner
//
// Tier gating runs through hasAccess() server-side (the ONE access source) and
// isPaidTier() (its client-safe set) — never a second copy of the tier rules.
//
// Dismissals are per user, per DEVICE, in localStorage, every access wrapped in
// try/catch: blocked storage must never break a screen, it only means the
// prompt may ask again. No migration, no server-side dismissal row.
//
// Pure: no DOM at module scope, no server-only (the route and the client both
// import it).
import { isPaidTier } from '@/lib/paywall';
import type { UsageSnapshot } from '@/lib/usage';

export type SoftPromptId =
  | 'usage'
  | 'estimate-approved'
  | 'first-payment'
  | 'winback'
  | 'trial-ending';

/** How often one prompt may appear:
 *  once → forever (per device), 14d → at most once per WINBACK_DAYS,
 *  day  → once per local calendar day. */
export type SoftPromptCap = 'once' | '14d' | 'day';
export type SoftPromptAction = 'wall' | 'plan' | 'convert';
/** The paywall variant a prompt opens (PaywallModal's own union, narrowed). */
export type SoftPromptVariant = 'invoice' | 'estimate' | 'winback';

export interface SoftPrompt {
  id: SoftPromptId;
  /** Dismissal key: the prompt plus the moment it is about, so the next
   *  occasion (another estimate, a later trial) asks again. */
  key: string;
  cap: SoftPromptCap;
  eyebrow: string;
  title: string;
  body: string;
  /** Primary button label. */
  cta: string;
  /** 'wall' opens the paywall, 'plan' opens Settings → Plan, 'convert' is
   *  handled by the screen it lives on (the estimate's Convert action). */
  action: SoftPromptAction;
  variant?: SoftPromptVariant;
  /** Replaces the paywall's default reason pill (nobody hit a limit here). */
  reason?: string;
}

/** Canceled users get the win-back at most this often. */
export const WINBACK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Tier gate ───────────────────────────────────────────────────────────────
// Non-paid users only (free and canceled): founder, active and past_due never
// see an upgrade prompt. The one exception is the trial banner, which exists
// only FOR a trialing user.
export function promptAllowedForTier(
  id: SoftPromptId,
  tier: string | null | undefined,
): boolean {
  if (id === 'trial-ending') return tier === 'trialing';
  if (id === 'winback') return tier === 'canceled';
  return !isPaidTier(tier);
}

// ── Dismissals (per user, per device) ───────────────────────────────────────
export type SeenMap = Record<string, string>; // dismissal key → ISO timestamp

const storeKey = (userId: string) => `onit_soft_prompts_v2:${userId}`;

/** Every dismissal this user has on this device. Never throws. */
export function readSeen(userId: string): SeenMap {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storeKey(userId)) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {}; // storage blocked or corrupt: behave as if nothing was seen
  }
}

/** When this user last saw `key`, or null. Unparseable stamps read as null. */
export function seenAt(userId: string, key: string, now: Date = new Date()): Date | null {
  const at = new Date(readSeen(userId)[key] ?? '');
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Remember that the prompt was shown (or dismissed) — starts its cap. */
export function markSeen(userId: string, key: string, now: Date = new Date()): void {
  try {
    const seen = readSeen(userId);
    seen[key] = now.toISOString();
    localStorage.setItem(storeKey(userId), JSON.stringify(seen));
  } catch { /* storage blocked: the prompt may ask again next load */ }
}

/** The LOCAL calendar day of a date, as YYYY-MM-DD (a day cap resets at local
 *  midnight, not 24 hours after the last show). */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Is `prompt` allowed to appear right now, given this device's dismissals? */
export function promptDue(prompt: SoftPrompt, userId: string, now: Date = new Date()): boolean {
  const at = seenAt(userId, prompt.key, now);
  if (!at) return true;
  if (prompt.cap === '14d') return now.getTime() - at.getTime() >= WINBACK_DAYS * DAY_MS;
  if (prompt.cap === 'day') return dayKey(at) !== dayKey(now);
  return false; // 'once'
}

// ── The prompts ─────────────────────────────────────────────────────────────
/** The invoice/estimate free counters, read the SAME way the usage line reads
 *  them (GET /api/access → hasAccess). No recount here. */
export function usageNudge(
  kind: 'invoice' | 'estimate',
  a: UsageSnapshot | null | undefined,
): SoftPrompt | null {
  if (!a || !promptAllowedForTier('usage', a.tier)) return null;
  const used = kind === 'invoice' ? a.invoiceCount : a.estimateCount;
  const limit = kind === 'invoice' ? a.invoiceLimit : a.estimateLimit;
  if (typeof used !== 'number' || typeof limit !== 'number' || limit < 2) return null;
  // One before the last is the moment worth a word: the last one is the wall's.
  if (used !== limit - 1) return null;
  const left = limit - used;
  const plural = kind === 'invoice' ? 'invoices' : 'estimates';
  return {
    id: 'usage',
    key: `usage:${kind}`,
    cap: 'once',
    eyebrow: 'Free plan',
    title: `${left} free ${kind} left`,
    body: `You’ve used ${used} of ${limit} free ${plural}. Unlimited ${plural} come with a plan.`,
    cta: 'See plans',
    action: 'wall',
    variant: kind,
    reason: `${used} of ${limit} free ${plural} used — ${left} left`,
  };
}

/** The moment an estimate comes back signed. The estimate screen owns the
 *  primary action (its existing Convert to Invoice), so `action: 'convert'` is
 *  a marker, not a wall — the quiet "Go Pro" link opens the paywall. */
export function estimateApprovedPrompt(
  clientName: string | null | undefined,
  estimateId: string,
): SoftPrompt {
  const first = (clientName ?? '').trim().split(/\s+/)[0] ?? '';
  return {
    id: 'estimate-approved',
    key: `estimate-approved:${estimateId}`,
    cap: 'once',
    eyebrow: 'Signed',
    title: first ? `${first} approved your estimate` : 'Your estimate was approved',
    body: 'Turn it into an invoice and get paid. Go Pro to keep estimates, invoices and expenses unlimited.',
    cta: 'Turn it into an invoice',
    action: 'convert',
    variant: 'estimate',
  };
}

/** The first payment this user ever recorded in the ledger. Once per user,
 *  ever — the moment cannot happen twice. */
export function firstPaymentPrompt(): SoftPrompt {
  return {
    id: 'first-payment',
    key: 'first-payment',
    cap: 'once',
    eyebrow: 'You got paid',
    title: 'First payment received',
    body: 'On It recorded it for you. Unlimited invoices, estimates and expenses come with a plan.',
    cta: 'See plans',
    action: 'wall',
    variant: 'invoice',
    reason: 'You got paid through On It',
  };
}

/** A lapsed customer (access_tier = 'canceled'): copy only, no discount and no
 *  coupon — the STRIPE_RETENTION_COUPON path is deliberately not involved.
 *  At most once per WINBACK_DAYS. */
export function winbackPrompt(): SoftPrompt {
  return {
    id: 'winback',
    key: 'winback',
    cap: '14d',
    eyebrow: 'Welcome back',
    title: 'Pick up where you left off',
    body: 'Your plan ended, so you’re back on the free limits. Restart for unlimited invoices, estimates and expenses.',
    cta: 'See plans',
    action: 'wall',
    variant: 'winback',
    reason: 'Welcome back — pick up where you left off',
  };
}

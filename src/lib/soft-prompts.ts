// Soft prompts: the one dismissible nudge card in chat (ChatNudgeCard). Nothing
// here blocks anything — the walls are the paywall; these are moments worth a
// quiet word. GET /api/prompts gathers the facts and calls pickSoftPrompt();
// the card shows it; "Not now" is remembered per device (localStorage).
//
//   canceled tier                     → winback (the paywall, winback variant)
//   trialing, trial day 11 or later   → trial ending (TRIAL_REMINDER_DAYS before
//                                       the end; points at Settings → Plan)
//   free, an estimate signed ≤ 14 d   → estimate signed (paywall, estimate variant)
//   free, ONE Stripe-webhook payment
//     in the last 14 days             → first payment (paywall, invoice variant)
//
// Pure: no DOM, no fetch, no server-only (the route and the chat both import it).
import { TRIAL_REMINDER_DAYS } from '@/lib/trial';

export const SOFT_PROMPT_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SoftPromptId = 'first-payment' | 'estimate-signed' | 'trial-ending' | 'winback';

export interface SoftPrompt {
  id: SoftPromptId;
  /** Dismissal key: the prompt plus the moment it is about, so the next
   *  occasion (a later payment, another trial) asks again. */
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Primary button label. */
  cta: string;
  /** 'wall' opens the paywall (variant + reason); 'plan' opens Settings → Plan. */
  action: 'wall' | 'plan';
  variant?: 'invoice' | 'estimate' | 'winback';
  reason?: string;
}

export interface PromptFacts {
  tier: string | null | undefined;
  trialEndsAt: string | null;
  /** Stripe-webhook ledger rows in the last 14 days (2 means "two or more"). */
  webhookPayments: number;
  lastWebhookPaymentAt: string | null;
  /** Estimates signed in the last 14 days. */
  estimatesSigned: number;
  lastEstimateSignedAt: string | null;
  now?: Date;
}

const longDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function pickSoftPrompt(f: PromptFacts): SoftPrompt | null {
  const now = f.now ?? new Date();
  const tier = f.tier ?? 'free';

  if (tier === 'canceled') {
    return {
      id: 'winback',
      key: 'winback',
      eyebrow: 'Welcome back',
      title: 'Pick up where you left off',
      body: 'Restart On It for unlimited invoices, estimates and expenses, plus recurring expenses and reports.',
      cta: 'See plans',
      action: 'wall',
      variant: 'winback',
    };
  }

  if (tier === 'trialing' && f.trialEndsAt) {
    const end = new Date(f.trialEndsAt);
    const remindFrom = end.getTime() - TRIAL_REMINDER_DAYS * DAY_MS;
    if (!Number.isNaN(end.getTime()) && now.getTime() >= remindFrom && now.getTime() < end.getTime()) {
      return {
        id: 'trial-ending',
        key: `trial-ending:${f.trialEndsAt}`,
        eyebrow: 'Your trial',
        title: `Your free trial ends ${longDay(end)}`,
        body: 'After that it’s $9.99/month, renewing monthly until you cancel. You can manage or cancel anytime in Settings.',
        cta: 'Manage plan',
        action: 'plan',
      };
    }
    return null;
  }

  if (tier !== 'free') return null; // paid tiers and anything unexpected: nothing to say

  if (f.estimatesSigned > 0) {
    return {
      id: 'estimate-signed',
      key: `estimate-signed:${f.lastEstimateSignedAt ?? ''}`,
      eyebrow: 'Signed',
      title: 'Your estimate was signed',
      body: 'Nice work. A free trial lifts the limits so you can invoice the job and keep estimates coming.',
      cta: 'Start free trial',
      action: 'wall',
      variant: 'estimate',
      reason: 'Your estimate was signed',
    };
  }

  if (f.webhookPayments === 1) {
    return {
      id: 'first-payment',
      key: `first-payment:${f.lastWebhookPaymentAt ?? ''}`,
      eyebrow: 'You got paid',
      title: 'A customer paid you online',
      body: 'On It collected it for you. A free trial lifts the invoice, estimate and expense limits.',
      cta: 'Start free trial',
      action: 'wall',
      variant: 'invoice',
      reason: 'You got paid through On It',
    };
  }

  return null;
}

// ── Dismissals (per device) ─────────────────────────────────────────────────
const DISMISSED_KEY = 'onit_soft_prompts_dismissed';
const DISMISSED_MAX = 30;

export function parseDismissed(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export function withDismissed(list: string[], key: string): string[] {
  return [...list.filter((k) => k !== key), key].slice(-DISMISSED_MAX);
}

export function isSoftPromptDismissed(key: string): boolean {
  try {
    return parseDismissed(localStorage.getItem(DISMISSED_KEY)).includes(key);
  } catch {
    return false; // storage blocked: show it; the next load asks again
  }
}

export function dismissSoftPrompt(key: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(withDismissed(parseDismissed(localStorage.getItem(DISMISSED_KEY)), key)));
  } catch { /* storage blocked */ }
}

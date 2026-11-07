// ═══ Chat router · Slice 2 — the decision, in one pure place ═══
//
// One small model call classifies a message (ask | build | unsupported). This
// module turns that classification into what the app does, and owns every rule
// for when the model is NOT asked at all. No I/O, so all of it is unit-tested.
//
// Fail open, always: a timeout, an error, unparseable output or the flag being
// off falls back to the OLD path — the hand-written regex gate, then /api/parse.
// That is the pre-Slice-2 behavior, unchanged, so a broken router can only cost
// a question, never an invoice.
import { shouldRouteToAsk } from '@/lib/ask-intent';

/** What the router may say a message is. */
export type RouterRoute = 'ask' | 'build' | 'unsupported';

/** Why the router was skipped. Every bypass goes straight to /api/parse. */
export type BypassReason = 'image' | 'clarification' | 'voice-followup';

export interface BypassSignals {
  /** A receipt/photo is staged for this turn. */
  imageAttached: boolean;
  /** A question is open on the card ("who's this for?") or a job is mid-build,
   *  so a terse "$40" is an answer, not a new job. */
  clarificationOpen: boolean;
  /** Dictated follow-up inside an active build ("make it 50"). */
  voiceFollowUp: boolean;
}

/**
 * Ordered on purpose: a photo wins over everything, an open question over a
 * dictated follow-up. The first match is the reason the model is skipped.
 */
export function bypassReason(signals: BypassSignals): BypassReason | null {
  if (signals.imageAttached) return 'image';
  if (signals.clarificationOpen) return 'clarification';
  if (signals.voiceFollowUp) return 'voice-followup';
  return null;
}

/**
 * A terse reply that can only be an answer to an open question: a bare amount
 * ("$40", "40 dollars", "35") or a short noun phrase ("the car wash", "for the
 * fence"). A real question is never one of these — it ends in "?" or runs long —
 * so the router still sees "who hasn't paid me" even mid-build.
 */
export function looksLikeAnswer(text: string): boolean {
  const t = text.trim();
  if (!t || t.endsWith('?')) return false;
  if (t.split(/\s+/).length > 5) return false;
  return /\d/.test(t) || /^(?:the|a|an|for|it'?s|that one|same)\b/i.test(t);
}

/**
 * A digit or a "$" is a job on its face. The regex gate has always applied this
 * (`/[\d$]/` in isUnpaidQuestion); here it also has to hold *before* the model
 * is asked, so "who owes me 50 for the fence" stays a new invoice.
 */
export function hasFigure(text: string): boolean {
  return /[\d$]/.test(text);
}

export type DecisionVia = 'bypass' | 'router' | 'regex';

export interface Decision {
  route: RouterRoute;
  via: DecisionVia;
}

/**
 * The whole decision, with no I/O.
 *
 *  - bypass           → build (parse), and the model is never called
 *  - a figure         → build, before the model is consulted
 *  - flag off         → the old path (regex; off ⇒ parse, exactly as today)
 *  - a valid answer   → that answer
 *  - null             → the old path (regex, then parse)
 *
 * `unsupported` is never downgraded into build: the server already composed its
 * reply, and letting it fall through would send "how much did I spend on gas?"
 * to /api/parse as an expense — the exact bug this slice exists to fix.
 */
export function decideRoute(input: {
  flagOn: boolean;
  bypass: BypassReason | null;
  classified: RouterRoute | null;
  text: string;
}): Decision {
  if (input.bypass) return { route: 'build', via: 'bypass' };

  // Same rule the regex gate applies, and it runs before the model is consulted:
  // a figure or a price can never be classified into a question.
  if (hasFigure(input.text)) return { route: 'build', via: 'regex' };

  const oldPath: Decision = shouldRouteToAsk({ flagOn: input.flagOn, text: input.text })
    ? { route: 'ask', via: 'regex' }
    : { route: 'build', via: 'regex' };

  if (!input.flagOn) return oldPath;
  if (!input.classified) return oldPath;
  return { route: input.classified, via: 'router' };
}

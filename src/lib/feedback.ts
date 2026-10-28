// "Tell us about On It" — pure helpers (FEEDBACK-SPEC.md). No I/O: the API route,
// the Settings screen and the Chat prompt all import from here.
import { z } from 'zod';

export const FEEDBACK_TAGS = ['idea', 'problem', 'love'] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];
export const FEEDBACK_SOURCES = ['settings', 'chat_prompt'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_MIN = 5;
export const FEEDBACK_MAX = 2000;

export const TAG_LABEL: Record<FeedbackTag, string> = {
  idea: 'Idea',
  problem: 'Problem',
  love: 'Love it',
};

/** Control characters (except newline and tab) out, CRLF to LF, outer space
 *  trimmed. Runs BEFORE the length check so a message of control characters
 *  can't pass as "long enough". */
export function cleanMessage(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/** Single-line, bounded: for header-ish fields (screen, version, subject parts). */
export function cleanLine(raw: string, max: number): string {
  return raw
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const FeedbackBody = z.object({
  tag: z.enum(FEEDBACK_TAGS),
  message: z
    .string()
    .max(FEEDBACK_MAX * 2) // hard cap on what we even clean; the real limit is after cleaning
    .transform(cleanMessage)
    .pipe(z.string().min(FEEDBACK_MIN).max(FEEDBACK_MAX)),
  rating: z.number().int().min(1).max(5).optional(),
  source: z.enum(FEEDBACK_SOURCES).default('settings'),
  screen: z.string().max(200).transform((s) => cleanLine(s, 60)).optional(),
  appVersion: z.string().max(200).transform((s) => cleanLine(s, 40)).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackBody>;

// ── Owner email (content only; the route sends it) ──────────────────────────

export interface FeedbackEmailInput {
  tag: FeedbackTag;
  message: string;
  rating?: number | null;
  source: FeedbackSource;
  screen?: string | null;
  appVersion?: string | null;
  businessName?: string | null;
  userEmail?: string | null;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function feedbackEmail(i: FeedbackEmailInput): { subject: string; text: string; html: string } {
  const who = cleanLine(i.businessName ?? '', 60) || 'new user';
  const subject = `On It feedback · ${i.tag} · ${who}`;
  const meta = [
    `Tag: ${TAG_LABEL[i.tag]}`,
    i.rating ? `Stars: ${i.rating}/5` : null,
    `Sent from: ${i.source === 'chat_prompt' ? 'Chat prompt' : 'Settings'}`,
    i.screen ? `Screen: ${i.screen}` : null,
    i.appVersion ? `App version: ${i.appVersion}` : null,
    i.userEmail ? `Reply to: ${i.userEmail} (just hit Reply)` : null,
  ].filter((x): x is string => !!x);
  const text = [i.message, '', '—', ...meta].join('\n');
  const html =
    `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1c1a17">` +
    `<p style="white-space:pre-wrap;margin:0 0 16px">${esc(i.message)}</p>` +
    `<p style="margin:0;color:#6b7280;font-size:13px">${meta.map(esc).join('<br>')}</p></div>`;
  return { subject, text, html };
}

// ── Chat prompt: when to ask (spec §4) ──────────────────────────────────────

export const PROMPT_MIN_DOCS = 3;
export const SNOOZE_DAYS = 21;
export const LONG_SNOOZE_DAYS = 60;
const DAY = 86_400_000;

export interface PromptState {
  lastShownAt: number | null; // ms
  snoozedUntil: number | null; // ms
  dismissals: number; // in a row
}
export const EMPTY_PROMPT_STATE: PromptState = { lastShownAt: null, snoozedUntil: null, dismissals: 0 };

export interface PromptContext {
  now: number;
  docsSent: number; // quotes + invoices the user has sent so far
  moment: boolean; // a quote or invoice was just sent / finalized
  hasSubmitted: boolean; // any feedback row for this user: never ask again
  blocked: boolean; // voice session, open template, paywall or tour
  state: PromptState;
}

export function shouldAskForFeedback(c: PromptContext): boolean {
  if (c.hasSubmitted) return false;
  if (c.blocked || !c.moment) return false;
  if (c.docsSent < PROMPT_MIN_DOCS) return false;
  if (c.state.snoozedUntil !== null && c.now < c.state.snoozedUntil) return false;
  if (c.state.lastShownAt !== null && c.now - c.state.lastShownAt < SNOOZE_DAYS * DAY) return false;
  return true;
}

/** The card was shown (whatever happens next, it won't come back for 21 days). */
export function afterShown(s: PromptState, now: number): PromptState {
  return { ...s, lastShownAt: now, snoozedUntil: now + SNOOZE_DAYS * DAY };
}

/** "Not now". Second dismissal in a row: 60 days of quiet, and the count resets. */
export function afterDismiss(s: PromptState, now: number): PromptState {
  const dismissals = s.dismissals + 1;
  if (dismissals >= 2) {
    return { lastShownAt: now, snoozedUntil: now + LONG_SNOOZE_DAYS * DAY, dismissals: 0 };
  }
  return { lastShownAt: now, snoozedUntil: now + SNOOZE_DAYS * DAY, dismissals };
}

/** Tolerant parse of the localStorage value; anything odd means "never shown". */
export function parsePromptState(raw: string | null): PromptState {
  if (!raw) return EMPTY_PROMPT_STATE;
  try {
    const v = JSON.parse(raw) as Partial<PromptState> | null;
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    return {
      lastShownAt: num(v?.lastShownAt),
      snoozedUntil: num(v?.snoozedUntil),
      dismissals: Math.max(0, Math.min(2, num(v?.dismissals) ?? 0)),
    };
  } catch {
    return EMPTY_PROMPT_STATE;
  }
}

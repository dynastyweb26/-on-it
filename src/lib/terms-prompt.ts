// When to show the "Add your terms" tip card (the shared ChatNudgeCard).
// State lives on the profile (profiles.terms_prompt_count / _dismissed_at), so
// it holds across devices and a cleared browser. The rule:
//   - only right after a document's FIRST successful send (not a resend)
//   - only while the terms are empty
//   - never again after a "Not now": terms_prompt_dismissed_at is a hard stop,
//     checked before the show cap (a dismissal does not spend one of the two
//     shows; once dismissed, the card is gone for good)
//   - shown at most twice ever: after the first send, and once more after the
//     next one (i.e. before the third send); then never again
//   - never when the columns don't exist yet (migration not applied): we could
//     not remember the dismissal, so we would nag every send
// Priority: this card beats every other tip at the same moment (payouts,
// payment alerts, feedback); only a blocking setup step outranks it.

export const TERMS_PROMPT_MAX_SHOWS = 2;

export type TermsPromptProfile = {
  terms?: string | null;
  terms_prompt_count?: number | null;
  terms_prompt_dismissed_at?: string | null;
} | null;

export function shouldOfferTermsPrompt(
  profile: TermsPromptProfile,
  ctx: { firstSend: boolean; blocked: boolean },
): boolean {
  if (!profile || !ctx.firstSend || ctx.blocked) return false;
  // `terms` is undefined (key absent from select('*')) until the migration lands.
  if (!('terms' in profile)) return false;
  if ((profile.terms ?? '').trim().length > 0) return false;
  // "Not now" is forever — checked before the cap, so a dismissal wins even
  // with shows left. Undefined (column absent, migration not applied) falls
  // through to the old behaviour.
  if (profile.terms_prompt_dismissed_at) return false;
  return (profile.terms_prompt_count ?? 0) < TERMS_PROMPT_MAX_SHOWS;
}

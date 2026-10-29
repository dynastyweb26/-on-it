// ═══ Voice hints: bias recognition toward the user's own names ═══
//
// The transcript is what AssemblyAI heard; this module only decides which of
// the owner's own words to send alongside the audio as context (AssemblyAI's
// `keyterms_prompt`). It never touches the transcript itself.
//
// Rules (UX audit #12 / SECURITY.md):
//   - Pure: no I/O, no database, no clock. Callers hand it raw names.
//   - Trim, collapse whitespace, strip tags and newlines.
//   - Drop anything under 3 characters (initials hurt more than they help).
//   - Dedupe case-insensitively, keeping the first spelling seen.
//   - Max 6 words per term, max 50 terms — the request payload has a limit and
//     a long list dilutes the bias.
//
// SECURITY.md is cleared for this: client and product names are already spoken
// inside the audio that goes to AssemblyAI, so the hint list adds no recipient
// and no storage. The caller logs the COUNT only, never the names.

export const MAX_TERMS = 50;
export const MAX_WORDS = 6;
export const MIN_TERM_LENGTH = 3;

/** Strip markup and line breaks, collapse whitespace. */
export function cleanTerm(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t\u000b\u000c]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The hint list, in input order, capped and deduped. */
export function buildVoiceHints(
  sources: ReadonlyArray<string | null | undefined>,
  max = MAX_TERMS,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of sources) {
    if (typeof raw !== 'string') continue;
    const term = cleanTerm(raw);
    if (term.length < MIN_TERM_LENGTH) continue;
    if (term.split(' ').length > MAX_WORDS) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * AssemblyAI `custom_spelling` entries, for single-token names only (a
 * multi-word phrase belongs in keyterms_prompt, not a spelling rule).
 * Identity mappings: the hint is "if you hear something close to this, write
 * this". The route falls back to a hint-free request if AssemblyAI rejects any
 * of it, so a bad list can never break voice.
 */
export function customSpellings(hints: ReadonlyArray<string>): { from: string; to: string }[] {
  return hints
    .filter((h) => !h.includes(' '))
    .map((h) => ({ from: h, to: h }));
}

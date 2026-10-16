// The client's match key, mirroring the database's generated
// clients.name_key = lower(btrim(name)) (migration 20261003000001).
// btrim() with no second argument strips spaces only — not tabs or newlines —
// so this does the same rather than String.prototype.trim().
export function clientNameKey(name: string): string {
  return name.replace(/^ +| +$/g, '').toLowerCase();
}

// The question /api/parse asks when an invoice or quote has no client.
const WHO_QUESTION = /who'?s this for\?\s*$/i;
const NAME_LEAD = /^(?:(?:it'?s|it is|this is|that'?s|that is)\s+)?(?:for\s+)?(?:(?:the\s+)?(?:client|customer)(?:'s name)?\s*(?:is|:)\s*)?/i;
const NOT_A_NAME = /^(?:yes|yeah|yep|no|nope|ok|okay|sure|idk|not sure|skip|later|none|n\/a)$/i;

/**
 * The client name in a short reply to "Who's this for?". The model has
 * returned no name for a plain answer ("TEST Pasted Card"), so the route takes
 * the answer itself: at most 6 words, no digits or "$" (a price, not a name),
 * after dropping a lead-in like "it's for". Null when the last reply didn't ask,
 * or the answer doesn't look like a name. The caller still applies its
 * generic-word check ("the customer").
 */
export function nameFromAnswer(lastAssistant: string, latestUser: string): string | null {
  if (!WHO_QUESTION.test(lastAssistant.trim())) return null;
  const s = latestUser.trim().replace(NAME_LEAD, '').replace(/[.!?,;]+$/, '').trim();
  if (!s || s.length > 60 || /[\d$\n]/.test(s) || s.split(/\s+/).length > 6 || NOT_A_NAME.test(s)) return null;
  return s;
}

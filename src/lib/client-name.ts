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
// Replies that answer or dodge the question without naming anyone. "cancel"
// only stayed out of the name field on the preview because the model called
// that turn a non-invoice; this list doesn't rely on that.
const NOT_A_NAME = /^(?:yes|yeah|yep|no|nope|nah|ok|okay|sure|idk|i don'?t know|not sure|skip|later|none|nobody|no one|n\/a|cancel|cancel it|stop|never ?mind|forget it|wait|hold on|hang on|what|huh|why|start over|undo)$/i;

/**
 * The client name in a short reply to "Who's this for?". The model has
 * returned no name for a plain answer ("TEST Pasted Card"), so the route takes
 * the answer itself: at most 6 words, no digits or "$" (a price, not a name),
 * after dropping a lead-in like "it's for". Null when the last reply didn't ask,
 * or the answer doesn't look like a name. A generic word the user typed
 * ("Client") is kept: see resolveClientName.
 */
export function nameFromAnswer(lastAssistant: string, latestUser: string): string | null {
  if (!WHO_QUESTION.test(lastAssistant.trim())) return null;
  const s = latestUser.trim().replace(NAME_LEAD, '').replace(/[.!?,;]+$/, '').trim();
  if (!s || s.length > 60 || /[\d$\n]/.test(s) || s.split(/\s+/).length > 6 || NOT_A_NAME.test(s)) return null;
  return s;
}

// A client_name that is a role or pronoun, not a name. The WHOLE value must be
// one of these words (optionally after an article/possessive), so a real name
// that happens to follow "the" survives ("the Johnsons", "The Home Depot").
// Words that are also real first names (Guy, Man…) only count with an article.
const GENERIC_BARE = /^(?:client|customer|homeowner|home owner|owner|tenant|landlord|someone|somebody|person|him|her|them|unknown|n\/?a|none|tbd|name|client name|customer name)s?$/i;
const GENERIC_WITH_ARTICLE = /^(?:the|a|an|my|our|this|that|some)\s+(?:client|customer|homeowner|home owner|owner|tenant|landlord|person|guy|lady|man|woman|gentleman|family)s?$/i;
export function isGenericClientName(name: string): boolean {
  const s = name.trim().replace(/^["'“‘]+|["'”’.,!?]+$/g, '').replace(/\s+/g, ' ');
  return !s || GENERIC_BARE.test(s) || GENERIC_WITH_ARTICLE.test(s);
}

/**
 * Who an invoice/quote is for, and where that came from:
 *   'answer' — the user's own reply to "Who's this for?", kept exactly as
 *              typed, generic words included ("Client" is the user's call);
 *   'model'  — the model's name, when it is a real one;
 *   'draft'  — a real name already on the draft (so "send it to the client"
 *              can't wipe "Maria");
 *   null     — none: the route asks "Who's this for?".
 * The generic-word guard only ever filters the model's and the draft's names.
 */
export function resolveClientName(p: {
  modelName: unknown;
  draftName: string | null;
  lastAssistant: string;
  latestUser: string;
}): { name: string | null; source: 'answer' | 'model' | 'draft' | null } {
  const answered = nameFromAnswer(p.lastAssistant, p.latestUser);
  if (answered) return { name: answered, source: 'answer' };
  const model = typeof p.modelName === 'string' ? p.modelName.trim() : '';
  if (model && !isGenericClientName(model)) return { name: model, source: 'model' };
  const draft = (p.draftName ?? '').trim();
  if (draft && !isGenericClientName(draft)) return { name: draft, source: 'draft' };
  return { name: null, source: null };
}

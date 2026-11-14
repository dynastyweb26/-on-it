// Does this Chat message ask about unpaid money, so it goes to /api/ask instead
// of /api/parse?
//
// STOPGAP: parse's SYSTEM prompt has no account-question intent, so until a real
// router (one model call that picks parse vs ask vs tools) exists, this is a
// narrow deterministic gate in front of it. Delete it when the router lands.
//
// Rules it must keep:
//  - Narrow: unpaid / owed / outstanding / overdue phrasing, plus a lookup
//    spoken as a command ("find Ruth", "show me my invoices"): short, anchored,
//    and opening with a lookup verb.
//  - Fail open: no match means today's /api/parse path, unchanged.
//  - Never hijack invoice building: any digit or "$" means no match, and a
//    command that carries a build word (create, make, record, send, new...) is
//    never a lookup, so "record a payment from Ruth" stays a build.

const MAX_CHARS = 80;

const LEAD = '(?:(?:hey|ok|okay|so|please|can you|could you|tell me|let me know)\\s+)*';
const TAIL = '(?:\\s+(?:me|us|to me|money|yet|now|today|right now|currently|still))*';
const OPEN = '(?:(?:what|which|show|list)(?:\\s+(?:me|are|is))?|are there|do i have|any)';
const MINE = '(?:(?:of\\s+)?(?:my|the)\\s+)?';
const UNPAID_WORD = '(?:unpaid|overdue|outstanding)';

const PATTERNS: RegExp[] = [
  // who hasn't paid (me) / who owes me
  "who (?:still )?(?:hasn'?t|has not|haven'?t|have not|didn'?t|did not) paid",
  'who (?:still )?owes',
  // any unpaid invoices / which invoices are overdue / show my outstanding bills
  `${OPEN}\\s+${MINE}${UNPAID_WORD}\\s+(?:invoices?|bills?)(?:\\s+(?:do i have|are there|i have))?`,
  `(?:which|what)\\s+(?:of\\s+)?${MINE}(?:invoices?|bills?)\\s+(?:are|is)\\s+${UNPAID_WORD}`,
  // anything overdue
  `(?:(?:is|are)\\s+)?(?:there\\s+)?(?:anything|something)\\s+(?:is\\s+)?${UNPAID_WORD}`,
  // outstanding balance
  `(?:what(?:'s| is)|how much is|show)\\s+${MINE}(?:total\\s+)?${UNPAID_WORD}\\s+(?:balance|invoices?|amount|money)`,
  // how much do people owe me
  'how much (?:do|does|is|are) (?:people|clients|customers|anyone|everyone|everybody|i) (?:still )?(?:owe|owing|owed)',
  'how much is (?:still )?owed',
].map((p) => new RegExp(`^${p}${TAIL}$`));

const LEAD_RE = new RegExp(`^${LEAD}`);

/** Lowercase, straight apostrophes, no trailing punctuation, single spaces. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[?!.\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isUnpaidQuestion(text: string): boolean {
  const t = normalize(text);
  if (!t || t.length > MAX_CHARS) return false;
  if (/[\d$]/.test(t)) return false; // a number or a price is invoice building
  const body = t.replace(LEAD_RE, '');
  return PATTERNS.some((p) => p.test(body));
}

/** The verbs a lookup opens with when it is spoken as a command. */
const LOOKUP_LEAD = '(?:show|find|pull up|list|open|look up|what about|who|how much|when)';
const LOOKUP_RE = new RegExp(`^${LOOKUP_LEAD}\\b`);

/** Words that make a message a create / record / send / edit request, never a lookup. */
const BUILD_WORD = /\b(?:create|make|new|add|log|record|send|resend|draft|write|charge|edit|change|update|delete|remove|cancel|start|bill)\b/;

/**
 * A lookup with no question mark: "find Ruth", "show me my invoices", "pull up
 * the Smith estimate". People speak to the app, so the question mark cannot be
 * the test. Same guarded shape as isUnpaidQuestion: short, no figure, opener at
 * the start, and no build word anywhere.
 */
export function isCommandLookup(text: string): boolean {
  const t = normalize(text);
  if (!t || t.length > MAX_CHARS) return false;
  if (/[\d$]/.test(t)) return false; // a figure is a job, even after "show"
  const body = t.replace(LEAD_RE, '');
  if (!LOOKUP_RE.test(body)) return false;
  return !BUILD_WORD.test(body);
}

/** Anything that should be looked up rather than built: an unpaid question or a command lookup. */
export function isLookupRequest(text: string): boolean {
  return isUnpaidQuestion(text) || isCommandLookup(text);
}

/** Route to /api/ask only with the build flag on and a lookup request. */
export function shouldRouteToAsk(input: { flagOn: boolean; text: string }): boolean {
  return input.flagOn && isLookupRequest(input.text);
}

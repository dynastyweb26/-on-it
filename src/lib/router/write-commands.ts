// ═══ Chat router · the fallback that knows a change from a job ═══
//
// Used only when /api/route cannot answer: the router is down, timed out, or the
// flag skipped the model. It is deliberately small, pure, and free of imports —
// no registry, no I/O — so the browser can run it without shipping the tool
// definitions.
//
// The rule that caused the bug: a digit or a "$" meant "job". A phone number is
// not a job, so a change command is recognised first. The builder keeps its own
// shapes and the guard below runs FIRST: naming an invoice/estimate/quote/bid/
// line alongside a create verb, billing with a figure, or spending with a figure
// is always build.
//
// Keep this in sync with the registry without importing it at runtime: the test
// in write-tool-phrases.test.ts fails when a registered write or send tool has no
// phrase here that routes to ask.

const normalize = (text: string): string =>
  text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

/** The documents the builder owns. */
const DOC_NOUN = /\b(?:invoice|invoices|estimate|estimates|quote|quotes|bid|bids|line|lines)\b/;
/** The verbs that make a document, not a lookup. */
const CREATE_VERB = /\b(?:add|create|new|make|start|write|bill)\b/;
/** A figure: a number or a price. */
const FIGURE = /[$]?\d/;
/** Spendings and payments: an amount next to these is a record, not a lookup. */
const SPEND = /\b(?:spent|spend|spending|paid|pay|bought|buy|purchased|expense|expenses)\b/;

/**
 * True when the message asks the builder to make something: a document plus a
 * create verb, a bill with a figure, or an expense with an amount. The fallback
 * never sends one of these to /api/ask.
 */
export function isBuildRequest(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (DOC_NOUN.test(t) && CREATE_VERB.test(t)) return true;
  if (/\bbill\b/.test(t) && FIGURE.test(t)) return true;
  if (SPEND.test(t) && FIGURE.test(t)) return true;
  return false;
}

/**
 * One pattern per capability the write tools cover: a client add, a contact
 * change, a saved item or price, an expense edit or delete, a draft delete, and
 * a due date or notes change. Only a draft delete and a due-date change are
 * allowed to name a document; everything else waits for the builder guard above.
 */
const PATTERNS: RegExp[] = [
  /\b(?:add|create|save|new)\b.*\bclient\b/,
  /\b(?:change|update|edit|set|fix|correct)\b.*\b(?:phone|email)\b/,
  /\bsave\b.*\b(?:at|for)\s*\$?\d/,
  /\bsave\b.*\b(?:product|item|service|price)\b/,
  /\b(?:edit|change|update|delete|remove)\b.*\bexpenses?\b/,
  /\bdelete\b.*\bdrafts?\b/,
  /\b(?:change|update|edit|set|move|correct)\b.*\b(?:due date|due|date|notes)\b/,
];

/**
 * True when a message is one of the changes a write tool already handles. The
 * builder guard wins: a job that happens to name a client is still a job.
 */
export function isWriteCommand(text: string): boolean {
  const t = normalize(text);
  if (!t || isBuildRequest(t)) return false;
  return PATTERNS.some((pattern) => pattern.test(t));
}

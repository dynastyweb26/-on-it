// Small models sometimes prepend conversational text ("On it! Here's...") or
// wrap output in markdown fences despite being told not to, which makes
// JSON.parse throw "Unexpected token 'O'". This isolates the JSON object so a
// stray preamble doesn't blow up the parse.
//
// Extracted from ai.ts so every AI path shares ONE implementation — the vision
// route hits the same class of bug and must not carry a second copy that can
// drift from this one.

/** Strip fences, then slice first '{' … last '}'. Returns the raw JSON text. */
export function isolateJsonObject(text: string): string {
  const stripped = text.replace(/```json|```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  return start !== -1 && end > start ? stripped.slice(start, end + 1) : stripped;
}

/**
 * isolateJsonObject + JSON.parse. Throws on unparseable output.
 *
 * When the assistant turn was prefilled with '{' — so the model structurally
 * cannot emit leading prose (a stronger guard than stripping it after the
 * fact) — the API returns only the continuation and does NOT echo the '{'.
 * Pass { assistantPrefill: true } to put it back before parsing.
 */
export function parseJsonObject(text: string, opts?: { assistantPrefill?: boolean }): unknown {
  const raw = opts?.assistantPrefill ? reprependBrace(text) : text;
  return JSON.parse(isolateJsonObject(raw));
}

/** Restore the prefilled '{'. Skip if the continuation already starts with one
 *  (defensive: never manufacture '{{…' if a model ever echoes the prefill). */
function reprependBrace(text: string): string {
  return /^\s*\{/.test(text) ? text : `{${text}`;
}

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

/** isolateJsonObject + JSON.parse. Throws on unparseable output. */
export function parseJsonObject(text: string): unknown {
  return JSON.parse(isolateJsonObject(text));
}

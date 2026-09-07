// Turn-trace logging for the chat flow. One turn_id per user message, logged at
// four points: the raw user message (input), the parsed result (parsed), the
// Supabase insert result on finalize (finalize), and the final confirmation
// string rendered to the user (confirm).
//
// Structured single-line JSON so a console can grep/filter it cleanly. OFF in
// production by default: it emits ONLY when NEXT_PUBLIC_TRACE === 'true'. A
// missing or any other value keeps it silent (fails closed), and the value is
// inlined at build time so a production bundle carries no logging at all.
const TRACE_ENABLED = process.env.NEXT_PUBLIC_TRACE === 'true';

// Free text in the chat flow carries client PII — names, addresses, phone
// numbers (the input) and the client name (the confirmation). By default we log
// only a length-and-shape summary; the raw text is included ONLY when this
// second flag is also set. Fails closed like the flag above.
const TRACE_VERBOSE = process.env.NEXT_PUBLIC_TRACE_VERBOSE === 'true';

export type TracePoint = 'input' | 'parsed' | 'finalize' | 'confirm';

/** One id per user message, shared across that turn's four trace points. */
export const newTurnId = () =>
  `turn_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** PII-safe view of a free-text string: its length and word count by default,
 *  the raw text only under NEXT_PUBLIC_TRACE_VERBOSE. Spread into a trace call. */
export function redactText(text: string): Record<string, unknown> {
  const t = text ?? '';
  if (TRACE_VERBOSE) return { text: t };
  const trimmed = t.trim();
  return { chars: t.length, words: trimmed ? trimmed.split(/\s+/).length : 0 };
}

/** Whether a message explicitly names a document type — a boolean, safe to log. */
export function namesDocType(text: string): boolean {
  return /\b(quote|invoice|bill|estimate)\b/i.test(text ?? '');
}

/** For an optional PII-bearing string (e.g. the duplicate warning, which names
 *  the client): its presence as a boolean by default, the raw text only under
 *  NEXT_PUBLIC_TRACE_VERBOSE. */
export function redactPresence(text: string | null | undefined): boolean | string {
  if (!text) return false;
  return TRACE_VERBOSE ? text : true;
}

export function traceTurn(turnId: string, point: TracePoint, data: Record<string, unknown>) {
  if (!TRACE_ENABLED) return;
  console.log(JSON.stringify({ tag: 'turn_trace', turn_id: turnId, point, ...data }));
}

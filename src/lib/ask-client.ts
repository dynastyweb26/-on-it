// Browser side of POST /api/ask. Takes the fetch as an argument so the outcomes
// (answer, signed out, rate limited, feature off, server error, no network) are
// unit-tested with a fake. Sends the user's question text and the turn id, and
// nothing else: no history, no draft.
//
// The turn id is how the router call and this call share ONE model-call budget
// (lib/tools/budget). A request without it still gets the per-request cap.

import type { AiMeter } from './ai-limit';

/** What /api/ask returns beside the reply. Each is present only when the server sent it. */
export type AskExtras = {
  /** A template id and its props, exactly as sent: the renderer re-checks them. */
  template?: { id: string; props: unknown };
  /** The plain-text answer for when there is no card (or the card's props do not fit). */
  fallback?: string;
  tool?: unknown;
  pending?: unknown;
  /** Where the tool's full list lives (in-app path), once the server returns it. */
  destination?: { screen: string; path: string };
  /** The AI count after this question (tiers flag on): the meter's next
   *  numbers, so it never re-fetches /api/access. Absent with the flag off. */
  ai?: AiMeter;
};

export type AskOutcome =
  | ({ kind: 'ok'; reply: string; messageId: string | null } & AskExtras)
  | { kind: 'signed-out'; reply: string }
  | { kind: 'rate-limited'; reply: string }
  // The day's questions are spent. Typed, with the numbers the limit card shows
  // and an empty reply: the wording is the UI's, and no turn was logged.
  | { kind: 'limit'; used: number; limit: number; resetsAt: string; reply: '' }
  | { kind: 'off' } // 404: the feature is not on here, so the caller uses parse as today
  | { kind: 'error'; reply: string }
  | { kind: 'network' };

export const ASK_COPY = {
  signedOut: "You're signed out. Sign in, then ask me again.",
  rateLimited: 'Too many questions in a row. Wait a moment, then tap Retry.',
  serverError: "That lookup didn't work on our end. Tap Retry.",
} as const;

export async function askQuestion(
  question: string,
  fetchImpl: typeof fetch = fetch,
  turnId?: string | null,
  sessionId?: string | null,
): Promise<AskOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(turnId ? { 'x-turn-id': turnId } : {}),
        // The chat thread's own session: the server reads the last turns under
        // it. A turn id changes every message and can never stand in for it.
        ...(sessionId ? { 'x-chat-session': sessionId } : {}),
      },
      body: JSON.stringify({ question }),
    });
  } catch {
    return { kind: 'network' };
  }
  if (res.status === 404) return { kind: 'off' };
  if (res.status === 401) return { kind: 'signed-out', reply: ASK_COPY.signedOut };
  if (res.status === 429) return { kind: 'rate-limited', reply: ASK_COPY.rateLimited };
  if (!res.ok) return { kind: 'error', reply: ASK_COPY.serverError };
  const data = (await res.json().catch(() => null)) as ({ reply?: unknown } & Record<string, unknown>) | null;
  // The spent-limit answer arrives as 200 with kind:'limit' and no reply.
  if (isObj(data) && data.kind === 'limit') {
    const meter = meterOf(data);
    if (!meter) return { kind: 'error', reply: ASK_COPY.serverError };
    return { kind: 'limit', reply: '', ...meter };
  }
  if (typeof data?.reply !== 'string' || !data.reply.trim()) {
    return { kind: 'error', reply: ASK_COPY.serverError };
  }
  const messageId = typeof data.messageId === 'string' && data.messageId.trim() ? data.messageId : null;
  return { kind: 'ok', reply: data.reply, messageId, ...extrasOf(data) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function extrasOf(data: Record<string, unknown>): AskExtras {
  const out: AskExtras = {};
  const t = data.template;
  if (isObj(t) && typeof t.id === 'string' && t.id) out.template = { id: t.id, props: t.props };
  if (typeof data.fallback === 'string' && data.fallback.trim()) out.fallback = data.fallback;
  if (data.tool != null) out.tool = data.tool;
  if (data.pending != null) out.pending = data.pending;
  const d = data.destination;
  if (isObj(d) && typeof d.screen === 'string' && typeof d.path === 'string' && d.path.startsWith('/') && !d.path.startsWith('//')) out.destination = { screen: d.screen, path: d.path };
  const ai = meterOf(data.ai);
  if (ai) out.ai = ai;
  return out;
}

/** A meter the UI can draw, or null: a malformed one is never half-used. */
function meterOf(v: unknown): AiMeter | null {
  if (!isObj(v)) return null;
  const { used, limit, resetsAt } = v;
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0) return null;
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 1) return null;
  if (typeof resetsAt !== 'string' || !resetsAt.trim()) return null;
  return { used: Math.floor(used), limit: Math.floor(limit), resetsAt };
}

// Browser side of POST /api/ask. Takes the fetch as an argument so the outcomes
// (answer, signed out, rate limited, feature off, server error, no network) are
// unit-tested with a fake. Sends the user's question text and the turn id, and
// nothing else: no history, no draft.
//
// The turn id is how the router call and this call share ONE model-call budget
// (lib/tools/budget). A request without it still gets the per-request cap.

export type AskDestination = { screen: string; path: string };
export type AskTemplate = { id: string; props: unknown; destination: AskDestination | null };

export type AskOutcome =
  | { kind: 'ok'; reply: string; messageId: string | null; template: AskTemplate | null }
  | { kind: 'signed-out'; reply: string }
  | { kind: 'rate-limited'; reply: string }
  | { kind: 'off' } // 404: the feature is not on here, so the caller uses parse as today
  | { kind: 'error'; reply: string }
  | { kind: 'network' };

export const ASK_COPY = {
  signedOut: "You're signed out. Sign in, then ask me again.",
  rateLimited: 'Too many questions in a row. Wait a moment, then tap Retry.',
  serverError: "That lookup didn't work on our end. Tap Retry.",
} as const;

/** The server's card and its declared destination; an unknown shape is no card. */
function templateFrom(value: unknown): AskTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const d = raw.destination;
  const destination = d && typeof d === 'object'
    && typeof (d as Record<string, unknown>).screen === 'string'
    && String((d as Record<string, unknown>).screen).trim()
    && typeof (d as Record<string, unknown>).path === 'string'
    && String((d as Record<string, unknown>).path).startsWith('/')
    ? {
      screen: String((d as Record<string, unknown>).screen),
      path: String((d as Record<string, unknown>).path),
    }
    : null;
  return { id: raw.id, props: raw.props, destination };
}

export async function askQuestion(
  question: string,
  fetchImpl: typeof fetch = fetch,
  turnId?: string | null,
): Promise<AskOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(turnId ? { 'x-turn-id': turnId } : {}),
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
  const data = (await res.json().catch(() => null)) as {
    reply?: unknown;
    messageId?: unknown;
    template?: unknown;
  } | null;
  if (typeof data?.reply !== 'string' || !data.reply.trim()) {
    return { kind: 'error', reply: ASK_COPY.serverError };
  }
  const messageId =
    typeof data.messageId === 'string' && data.messageId.trim() ? data.messageId : null;
  return { kind: 'ok', reply: data.reply, messageId, template: templateFrom(data.template) };
}

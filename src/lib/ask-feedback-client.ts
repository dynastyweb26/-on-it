// Browser side of POST /api/ask/feedback. fetch is injected so every outcome is
// unit-tested. A failure names its cause: 401 signed out, 429 slow down, anything
// else (a 4xx/5xx, no network) "could not save".
export type FeedbackBody = {
  messageId: string;
  /** null clears the vote. */
  thumb: 'up' | 'down' | null;
  reasons: readonly string[];
  note: string | null;
};

export type FeedbackOutcome =
  | { kind: 'ok' }
  | { kind: 'signed-out' | 'rate-limited' | 'error'; message: string };

export const FEEDBACK_COPY = {
  signedOut: "You're signed out. Sign in, then try again.",
  slowDown: 'Slow down a moment, then try again.',
  failed: 'Could not save.',
} as const;

export async function sendThumb(body: FeedbackBody, fetchImpl: typeof fetch = fetch): Promise<FeedbackOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/ask/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: 'error', message: FEEDBACK_COPY.failed };
  }
  if (res.ok) return { kind: 'ok' };
  if (res.status === 401) return { kind: 'signed-out', message: FEEDBACK_COPY.signedOut };
  if (res.status === 429) return { kind: 'rate-limited', message: FEEDBACK_COPY.slowDown };
  return { kind: 'error', message: FEEDBACK_COPY.failed };
}

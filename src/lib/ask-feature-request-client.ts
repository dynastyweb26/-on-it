// Browser side of POST /api/ask/request-feature. fetch is injected so each outcome is
// unit-tested. The request is attached to the reply's messageId; no text comes from
// the browser. A failure names its cause.
export type FeatureRequestOutcome =
  | { kind: 'ok' }
  | { kind: 'signed-out' | 'rate-limited' | 'error'; message: string };

export const FEATURE_REQUEST_COPY = {
  signedOut: "You're signed out. Sign in, then try again.",
  slowDown: 'Slow down a moment, then try again.',
  // The designed error line (CantDo.dc.html).
  failed: "Couldn't send the request. Tap to try again.",
} as const;

export async function sendFeatureRequest(messageId: string, fetchImpl: typeof fetch = fetch): Promise<FeatureRequestOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/ask/request-feature', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId }),
    });
  } catch {
    return { kind: 'error', message: FEATURE_REQUEST_COPY.failed };
  }
  if (res.ok) return { kind: 'ok' };
  if (res.status === 401) return { kind: 'signed-out', message: FEATURE_REQUEST_COPY.signedOut };
  if (res.status === 429) return { kind: 'rate-limited', message: FEATURE_REQUEST_COPY.slowDown };
  return { kind: 'error', message: FEATURE_REQUEST_COPY.failed };
}

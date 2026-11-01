// ═══ Bank connect — what a route response is allowed to do ═══
// Pure plans for the two preview-only routes the Connect button calls. The
// client renders from these, so the rule the founder hit ("a failed exchange
// must never look connected, and a failed link token must never open the mock
// sheet") is testable without a DOM.
//
// The mock path is exactly one thing: a 404 from /api/plaid/link-token. That is
// the gate saying this build has no Plaid routes (plaidRouteEnabled is false).
// Any other non-2xx is a real failure and becomes a toast.

export const OPEN_BANK_FAILED_TOAST = 'We couldn’t open your bank. Try again.';
export const CONNECT_FAILED_TOAST = 'We couldn’t connect that bank. Try again.';

function text(body: unknown, key: string): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export type LinkTokenPlan =
  | { kind: 'mock' }
  | { kind: 'open'; token: string }
  | { kind: 'error'; message: string };

export function linkTokenPlan(status: number, body: unknown): LinkTokenPlan {
  // The route gate: not a preview build, so the placeholder sheet is the flow.
  if (status === 404) return { kind: 'mock' };
  const token = text(body, 'link_token');
  if (status >= 200 && status < 300 && token) return { kind: 'open', token };
  // A 2xx without a token is still a failure — never fall back to the mock.
  return { kind: 'error', message: text(body, 'message') ?? OPEN_BANK_FAILED_TOAST };
}

export type ExchangePlan =
  | { kind: 'ok'; itemId: string | null; institution: string | null }
  | { kind: 'error'; message: string };

export function exchangePlan(status: number, body: unknown): ExchangePlan {
  // Status decides first: a body that carries an item_id on a failure can never
  // advance the screen to "choose accounts".
  if (status >= 200 && status < 300) {
    return {
      kind: 'ok',
      itemId: text(body, 'item_id'),
      institution: text(body, 'institution_name'),
    };
  }
  return { kind: 'error', message: text(body, 'message') ?? CONNECT_FAILED_TOAST };
}

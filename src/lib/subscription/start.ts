// ═══ The purchase action ═══
// ONE function starts the subscription, so the shape of the wall doesn't decide
// how you pay. Today it asks POST /api/checkout for a Stripe hosted Checkout
// URL and sends the browser there. When Apple IAP lands, this file is the only
// thing that changes: the paywall's steps call startSubscription() and never
// name Stripe, checkout or a price.
//
// Not a Server Action and not 'use client' — a plain browser module. Callers
// are client components; the server side (/api/checkout) is untouched.
//
// The outcome is honest: `started: true` means the browser has been handed to
// the payment sheet (nothing else to do), `started: false` carries the message
// the wall shows inline (billing dormant, rate limited, network down).

/** Where Checkout returns to (POST /api/checkout's whitelist): the screen that
 *  showed the wall, so a blocked invoice card or expense is right there. */
export type CheckoutReturn = 'chat' | 'summary' | 'books' | 'invoices' | 'recurring' | 'settings';

export type StartOutcome =
  | { started: true }
  | { started: false; message: string };

/** Shown when the server says nothing useful (a 500, a dropped connection). */
export const START_UNAVAILABLE = 'Payments aren’t live yet — hang tight.';

/**
 * Start the subscription from `returnTo`. Never throws — any failure becomes a
 * message the wall displays. Safe to call once per tap; the caller owns the
 * busy state.
 */
export async function startSubscription(returnTo: CheckoutReturn): Promise<StartOutcome> {
  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ returnTo }),
    });
    const data = (await res.json().catch(() => null)) as { url?: unknown; message?: unknown } | null;
    const url = typeof data?.url === 'string' ? data.url : null;
    if (url) {
      // Stripe hosted Checkout — or, later, whatever the provider hands back.
      window.location.href = url;
      return { started: true };
    }
    const message = typeof data?.message === 'string' ? data.message : START_UNAVAILABLE;
    return { started: false, message };
  } catch {
    return { started: false, message: START_UNAVAILABLE };
  }
}

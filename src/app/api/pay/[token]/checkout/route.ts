// POST /api/pay/[token]/checkout — "Pay with card" on the public pay page.
// Creates a Stripe Checkout Session ON THE SELLER'S connected account (direct
// charge, no application fee) for exactly what the invoice owes right now,
// and returns its URL. The page redirects with fetch → window.location (CSP
// form-action is 'self').
//
// Public and unauthenticated (the bearer token IS the authorization, as for
// the pay page itself), so IP rate-limited. The client sends nothing but the
// token in the URL — no amount, no account, no invoice id is accepted. Every
// gate is re-checked here from the server-only RPC get_public_invoice_checkout;
// the page's card_available flag is display-only and never trusted:
//   • Connect switched on in this deployment (STRIPE_CONNECT_ENABLED + keys)
//   • invoice (not quote), status sent or overdue, not draft/deleted
//   • seller has a connected account, charges enabled, and opted in
//   • amount due now (dueNowFromLedger, shared with the page) > 0
// An open session for the same invoice + amount is reused (double-pay guard).
//
// The webhook (/api/webhooks/stripe/connect) records the payment from
// metadata.invoice_id and amount_total; this route writes nothing to the DB.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { connectEnabled, stripeErrorLog } from '@/lib/stripe/connect';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { dueNowFromLedger } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';

export const runtime = 'nodejs';

// Same shape check as the pay page: base64url, ≤ 32 chars.
const TOKEN_RE = /^[A-Za-z0-9_-]{1,32}$/;
// No meaningful body — validate anyway (security pattern).
const CheckoutBody = z.object({}).nullish();

// Stripe requires expires_at 30 min – 24 h after creation.
// Sessions are bucketed into 30-minute windows (see the double-pay guard
// below); every session created in a window expires at windowStart + 61 min,
// i.e. 31–61 min after creation — always inside Stripe's range, and
// deterministic within the window so the idempotency key's params match.
const WINDOW_SECONDS = 30 * 60;
const EXPIRY_AFTER_WINDOW_START = 61 * 60;
// An open session is reused only if it has at least this long left.
const REUSE_MIN_REMAINING_SECONDS = 5 * 60;
// Stripe's minimum charge in USD.
const MIN_CENTS = 50;

// ── Double-pay guard ─────────────────────────────────────────────────────
// Two tabs (or two taps) must not produce two payable sessions for the same
// balance. Three layers:
//   1. Reuse: an OPEN session on the seller's account for this invoice AND
//      this exact amount, with ≥5 min left, is returned instead of a new one.
//      Opening one session in two tabs is safe — Stripe completes it once.
//   2. Stale sessions are expired: an open session for this invoice at a
//      DIFFERENT amount (the due-now changed, e.g. a deposit got paid) could
//      overpay, so it's expired before a new one is created.
//   3. Concurrent first clicks (both list, both find nothing) share one
//      Stripe idempotency key per (invoice, amount, 30-min window), so Stripe
//      returns the same session to both.
// Residual: two sessions paid across a window boundary. The webhook records
// both (unique per session), and the excess shows as credit (amount_paid >
// total → calculateInvoiceTotals.credit). Refunds are the seller's call.
async function findOrExpireOpenSessions(
  stripe: NonNullable<ReturnType<typeof getStripe>>,
  account: string,
  invoiceId: string,
  cents: number,
  nowSec: number
): Promise<string | null> {
  const open = await stripe.checkout.sessions.list(
    // Sessions live ≤ 61 min; look back a little further than that.
    { status: 'open', limit: 100, created: { gte: nowSec - 2 * 60 * 60 } },
    { stripeContext: account }
  );
  let reuse: string | null = null;
  for (const s of open.data) {
    if (s.metadata?.invoice_id !== invoiceId) continue;
    const remaining = (s.expires_at ?? 0) - nowSec;
    if (!reuse && s.amount_total === cents && remaining >= REUSE_MIN_REMAINING_SECONDS && s.url) {
      reuse = s.url;
      continue;
    }
    if (s.amount_total !== cents) {
      // Stale amount — could overpay. Best effort: it may have just completed.
      try {
        await stripe.checkout.sessions.expire(s.id, {}, { stripeContext: account });
      } catch (e) {
        console.warn('pay checkout: could not expire stale session', stripeErrorLog(e));
      }
    }
  }
  return reuse;
}

interface CheckoutRow {
  invoice_id: string;
  invoice_number: number;
  kind: string | null;
  status: string | null;
  business_name: string | null;
  total: number | string | null;
  deposit_amount: number | string | null;
  amount_paid: number | string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean | null;
  card_payments_enabled: boolean | null;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Uniform refusal: a code for the client plus a sentence it can show.
const refuse = (status: number, error: string, message: string) =>
  NextResponse.json({ error, message }, { status });

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!(await rateLimit('pay_checkout', rateIdentifier(req)))) {
    return refuse(429, 'rate_limited', 'Too many tries just now. Wait a moment and try again.');
  }
  if (!CheckoutBody.safeParse(await req.json().catch(() => ({}))).success) {
    return refuse(400, 'invalid_request', 'Something went wrong. Refresh the page and try again.');
  }
  const token = params.token;
  if (!TOKEN_RE.test(token)) {
    return refuse(404, 'not_found', 'This link isn’t valid.');
  }

  const stripe = getStripe();
  if (!stripe || !connectEnabled()) {
    return refuse(503, 'card_unavailable', 'Card payments aren’t available right now.');
  }

  const { data, error } = await adminClient().rpc('get_public_invoice_checkout', { p_token: token });
  if (error) {
    console.error('pay checkout: rpc failed', error.message);
    return refuse(500, 'lookup_failed', 'We couldn’t load this invoice. Please try again.');
  }
  const row = ((data as CheckoutRow[] | null) ?? [])[0];
  if (!row) return refuse(404, 'not_found', 'This link isn’t valid.');

  if (row.kind === 'quote' || (row.status !== 'sent' && row.status !== 'overdue')) {
    return refuse(409, 'not_payable', 'This invoice can’t be paid online right now.');
  }
  if (!row.stripe_account_id || !row.stripe_charges_enabled || !row.card_payments_enabled) {
    return refuse(409, 'card_unavailable', 'Card payments aren’t available for this invoice.');
  }

  const { dueNow } = dueNowFromLedger(num(row.total), num(row.deposit_amount), num(row.amount_paid));
  const cents = Math.round(dueNow * 100);
  if (cents <= 0) return refuse(409, 'nothing_due', 'Nothing is due on this invoice.');
  if (cents < MIN_CENTS) {
    return refuse(409, 'below_minimum', 'This amount is too small to pay by card. Use another method below.');
  }

  const origin = req.nextUrl.origin;
  const docNumber = formatDocNumber('invoice', row.invoice_number);
  const business = (row.business_name ?? '').trim() || 'Invoice';

  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const reused = await findOrExpireOpenSessions(stripe, row.stripe_account_id, row.invoice_id, cents, nowSec);
    if (reused) return NextResponse.json({ url: reused });

    const windowStart = nowSec - (nowSec % WINDOW_SECONDS);
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        // Card only: connected accounts have Klarna, Cash App Pay, etc.
        // enabled by default, and the ledger/UX here is built for cards.
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: cents,
              product_data: { name: `${business} — ${docNumber}` },
            },
          },
        ],
        // The webhook's contract: which invoice this pays.
        metadata: { invoice_id: row.invoice_id },
        payment_intent_data: { metadata: { invoice_id: row.invoice_id } },
        expires_at: windowStart + EXPIRY_AFTER_WINDOW_START,
        success_url: `${origin}/pay/${token}?paid=1`,
        cancel_url: `${origin}/pay/${token}`,
      },
      // Direct charge on the seller's account. No application_fee_amount.
      // Idempotency (guard layer 3): same invoice + amount + window + origin →
      // the same session. Params are deterministic within the window.
      {
        stripeContext: row.stripe_account_id,
        idempotencyKey: `pay-${row.invoice_id}-${cents}-${windowStart}-${origin}`,
      }
    );
    // The idempotency key can hand back this window's earlier session. If it
    // was already paid (webhook not landed yet, so dueNow hasn't dropped),
    // don't start another payment.
    if (session.status === 'complete') {
      return refuse(409, 'payment_processing', 'A card payment for this invoice is already being confirmed. Refresh in a minute.');
    }
    if (!session.url) throw new Error('checkout session has no url');
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('pay checkout: session create failed', stripeErrorLog(e));
    return refuse(500, 'checkout_failed', 'We couldn’t start the card payment. Please try again.');
  }
}

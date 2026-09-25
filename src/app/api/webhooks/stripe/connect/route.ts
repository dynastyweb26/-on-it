// POST /api/webhooks/stripe/connect — Stripe Connect SNAPSHOT events from
// sellers' connected accounts (v1 event shape; event.account = the seller).
// Configured in Stripe as an event destination listening to "Connected
// accounts", signed with its own secret STRIPE_CONNECT_WEBHOOK_SECRET.
// (Accounts v2 status events are THIN events and arrive separately at
// /api/webhooks/stripe/connect/v2 — different payload, different secret.)
//
// Handles:
//   checkout.session.completed            (payment_status === 'paid' only)
//   checkout.session.async_payment_succeeded
//       → one method='card' row in invoice_payments, keyed by the Checkout
//         Session id (ON CONFLICT DO NOTHING: replays and the completed/async
//         pair are no-ops). Amount = session.amount_total / 100, i.e. what
//         Stripe actually charged — never recomputed from the invoice.
//   account.application.deauthorized
//       → the seller disconnected On It: clear the account + flags, card off.
//   account.updated
//       → fallback status refresh (re-reads the v2 account). The primary path
//         is the v2 thin events.
//
// Server-to-server, no user session → service-role admin client (audited use).
// runtime = 'nodejs': signature verification needs the RAW body (req.text(),
// byte-for-byte — never req.json(), never zod) and node crypto.
//
// Error contract (same as /api/webhooks/stripe):
//   missing/invalid signature               → 400
//   unrecognized/uninteresting/unmatched evt → 200 (log + skip)
//   handler DB failure / exception          → 500 (Stripe retries with backoff)
//   handled successfully                    → 200
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe/server';
import { adminClient } from '@/lib/supabase/admin';
import {
  ACCOUNT_INCLUDE,
  clearConnectAccount,
  statusFromV2Account,
  writeConnectStatusByAccount,
} from '@/lib/stripe/connect';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A paid Checkout Session on a seller's account → one ledger row.
// Returns a short outcome string for the log line. Throws on DB failure.
async function recordCardPayment(event: Stripe.Event, session: Stripe.Checkout.Session): Promise<string> {
  const account = event.account;
  if (!account) return 'skip: no event.account (not a connected-account event)';

  if (session.payment_status !== 'paid') return `skip: payment_status=${session.payment_status}`;

  // Contract with the pay-page checkout route: metadata.invoice_id.
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId || !UUID_RE.test(invoiceId)) return 'skip: no invoice_id in session metadata';

  // What Stripe actually charged. USD only (On It is US-only); anything else
  // would corrupt a dollar ledger, so it's logged and skipped, not recorded.
  if ((session.currency ?? '').toLowerCase() !== 'usd') return `skip: currency=${session.currency}`;
  const cents = session.amount_total ?? 0;
  if (!Number.isInteger(cents) || cents <= 0) return `skip: amount_total=${session.amount_total}`;
  const amount = cents / 100;

  const admin = adminClient();

  // Cross-check: the invoice's owner must be the seller whose account took
  // the money. On a mismatch, record nothing.
  const { data: invoice, error: invErr } = await admin
    .from('invoices').select('id, user_id').eq('id', invoiceId).maybeSingle();
  if (invErr) throw invErr;
  if (!invoice) return 'skip: invoice not found';

  const { data: owner, error: ownErr } = await admin
    .from('profiles').select('stripe_account_id').eq('id', invoice.user_id).maybeSingle();
  if (ownErr) throw ownErr;
  if (!owner?.stripe_account_id || owner.stripe_account_id !== account) {
    console.warn('stripe connect webhook: account mismatch — not recorded', JSON.stringify({
      event: event.id, session: session.id, invoice: invoice.id,
    }));
    return 'skip: event.account does not match invoice owner';
  }

  // Idempotent insert: ON CONFLICT (stripe_checkout_session_id) DO NOTHING.
  // The ledger trigger recomputes invoices.amount_paid / status.
  const { data: inserted, error: insErr } = await admin
    .from('invoice_payments')
    .upsert(
      {
        invoice_id: invoice.id,
        user_id: invoice.user_id,
        amount,
        method: 'card',
        paid_at: new Date(event.created * 1000).toISOString(),
        note: 'Paid by card (Stripe)',
        stripe_checkout_session_id: session.id,
      },
      { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true }
    )
    .select('id');
  if (insErr) throw insErr;
  return inserted && inserted.length ? `recorded ${amount}` : 'duplicate session — no-op';
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim();
  // Dormant path: not configured in this environment. Never throw.
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'connect_webhook_not_configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  // RAW body — required for signature verification.
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  try {
    let outcome: string;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        outcome = await recordCardPayment(event, event.data.object as Stripe.Checkout.Session);
        break;
      }
      case 'account.application.deauthorized': {
        if (!event.account) { outcome = 'skip: no event.account'; break; }
        outcome = `cleared ${await clearConnectAccount(event.account)} profile(s)`;
        break;
      }
      case 'account.updated': {
        if (!event.account) { outcome = 'skip: no event.account'; break; }
        const account = await stripe.v2.core.accounts.retrieve(event.account, { include: ACCOUNT_INCLUDE });
        outcome = `status written to ${await writeConnectStatusByAccount(statusFromV2Account(account))} profile(s)`;
        break;
      }
      default:
        // Acknowledged, not processed — Stripe won't retry a 200.
        console.log('stripe connect webhook:', event.type, 'ignored');
        return NextResponse.json({ received: true, ignored: event.type });
    }
    // Observability: type + outcome only (no amounts beyond the recorded
    // figure, no customer or seller personal data).
    console.log('stripe connect webhook:', event.type, event.id, outcome);
    return NextResponse.json({ received: true });
  } catch (e) {
    // Transient DB/Stripe failure → 500 so Stripe retries with backoff.
    const err = e as { type?: string; code?: string; message?: string; details?: string; hint?: string };
    console.error('stripe connect webhook handler error', event.type, event.id, JSON.stringify({
      type: err?.type, code: err?.code, message: err?.message, details: err?.details, hint: err?.hint,
    }));
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
}

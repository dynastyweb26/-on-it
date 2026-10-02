// ═══ Refunds and disputes on Connect card payments → ledger reversal rows ═══
// Called by the Connect snapshot webhook (/api/webhooks/stripe/connect).
// Migration 20261005000000 holds the model; in short:
//   refund              −amount  money back to the client, the seller's choice.
//                                Counts in cash-basis income; the invoice
//                                stays paid (reconcile excludes refunds).
//   dispute_withdrawn   −amount  Stripe pulled the disputed funds. Reduces
//                                paid: the invoice is owed again.
//   dispute_reinstated  +amount  dispute won, funds back. Paid again.
//
// Idempotency: every row is keyed by (entry_type, Stripe object id: re_/du_)
// and inserted ON CONFLICT DO NOTHING, so Stripe retries and the several
// events one refund produces (charge.refunded, refund.created/updated) land
// one row. paid_at comes from the Stripe object or the event, never now(),
// so a retry can't move money between periods.
//
// Only payments On It recorded are touched: a refund or dispute on any other
// charge on the seller's account finds no ledger row and is skipped.
//
// Service role throughout (reversal rows are refused by RLS for users).
// Throws on DB/Stripe failure → the webhook returns 500 → Stripe retries.
import 'server-only';
import type Stripe from 'stripe';
import { adminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = ReturnType<typeof adminClient>;
export type LedgerPayment = { id: string; invoice_id: string; user_id: string; method: string };
type Found = { payment: LedgerPayment } | { skip: string };

const idOf = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id ?? null);

/** Thrown when the payment a reversal belongs to isn't in the ledger YET (its
 *  checkout webhook hasn't landed). The webhook 500s so Stripe retries. */
export class PaymentNotRecordedYet extends Error {}

/**
 * The On It ledger payment behind a PaymentIntent on `account`, or why not.
 * 1. By stripe_payment_intent_id (every payment recorded after 20261005000000).
 * 2. Older rows: the PaymentIntent's metadata.invoice_id says whether it's an
 *    On It payment at all; if so, its Checkout Session finds the row, which is
 *    then stamped with the PaymentIntent id so step 1 finds it next time.
 * Then the same cross-check as recording: the row's owner must be the seller
 * whose account the event came from.
 */
export async function findLedgerPayment(stripe: Stripe, account: string, piId: string): Promise<Found> {
  const admin = adminClient();
  const cols = 'id, invoice_id, user_id, method';

  const { data: byPi, error: piErr } = await admin
    .from('invoice_payments').select(cols)
    .eq('stripe_payment_intent_id', piId).eq('entry_type', 'payment')
    .maybeSingle();
  if (piErr) throw piErr;
  let payment = byPi as LedgerPayment | null;

  if (!payment) {
    const pi = await stripe.paymentIntents.retrieve(piId, {}, { stripeContext: account });
    const invoiceId = pi.metadata?.invoice_id;
    if (!invoiceId || !UUID_RE.test(invoiceId)) return { skip: 'not an On It payment' };

    const sessions = await stripe.checkout.sessions.list({ payment_intent: piId, limit: 1 }, { stripeContext: account });
    const sessionId = sessions.data[0]?.id;
    if (sessionId) {
      const { data: bySession, error: sErr } = await admin
        .from('invoice_payments').select(cols)
        .eq('stripe_checkout_session_id', sessionId).eq('entry_type', 'payment')
        .maybeSingle();
      if (sErr) throw sErr;
      payment = bySession as LedgerPayment | null;
    }

    if (!payment) {
      // An On It payment with no ledger row: either the checkout webhook hasn't
      // landed yet (retry), or recording skipped it for good (invoice gone, or
      // owned by another account). Only the first is worth a retry.
      const { data: inv, error: invErr } = await admin
        .from('invoices').select('user_id').eq('id', invoiceId).maybeSingle();
      if (invErr) throw invErr;
      if (!inv) return { skip: 'invoice not found' };
      if (!(await ownsAccount(admin, inv.user_id as string, account))) {
        return { skip: 'event.account does not match invoice owner' };
      }
      throw new PaymentNotRecordedYet(`payment for ${piId} not in the ledger yet`);
    }

    const { error: stampErr } = await admin
      .from('invoice_payments').update({ stripe_payment_intent_id: piId })
      .eq('id', payment.id).is('stripe_payment_intent_id', null);
    if (stampErr) throw stampErr;
  }

  if (!(await ownsAccount(admin, payment.user_id, account))) {
    console.warn('stripe connect webhook: reversal account mismatch — not recorded', JSON.stringify({ payment: payment.id }));
    return { skip: 'event.account does not match payment owner' };
  }
  return { payment };
}

async function ownsAccount(admin: Admin, userId: string, account: string): Promise<boolean> {
  const { data, error } = await admin
    .from('profiles').select('stripe_account_id').eq('id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.stripe_account_id) && data!.stripe_account_id === account;
}

type ReversalType = 'refund' | 'dispute_withdrawn' | 'dispute_reinstated';

/** Insert one reversal row; ON CONFLICT (entry_type, stripe_object_id) DO
 *  NOTHING. `amount` is signed dollars. Returns true if this call inserted it. */
async function insertReversal(payment: LedgerPayment, type: ReversalType, objectId: string, amount: number, paidAt: Date): Promise<boolean> {
  const { data, error } = await adminClient()
    .from('invoice_payments')
    .upsert(
      {
        invoice_id: payment.invoice_id,
        user_id: payment.user_id,
        amount,
        method: payment.method,
        paid_at: paidAt.toISOString(),
        note: NOTE[type],
        entry_type: type,
        stripe_object_id: objectId,
        reverses_payment_id: payment.id,
      },
      { onConflict: 'entry_type,stripe_object_id', ignoreDuplicates: true }
    )
    .select('id');
  if (error) throw error;
  return Boolean(data && data.length);
}

const NOTE: Record<ReversalType, string> = {
  refund: 'Refunded (Stripe)',
  dispute_withdrawn: 'Disputed — funds withdrawn (Stripe)',
  dispute_reinstated: 'Dispute won — funds reinstated (Stripe)',
};

/** USD cents → dollars, or null for anything the dollar ledger can't hold. */
function usdDollars(currency: string | null | undefined, cents: number | null | undefined): number | null {
  if ((currency ?? '').toLowerCase() !== 'usd') return null;
  if (!Number.isInteger(cents) || (cents as number) <= 0) return null;
  return (cents as number) / 100;
}

// ── Refunds ────────────────────────────────────────────────────────

/**
 * Bring one refund's ledger row in line with the refund's status:
 *   succeeded / pending → the row exists (pending card refunds have already
 *                         left the balance, so cash basis counts them)
 *   failed / canceled   → the row is removed (the money came back)
 *   requires_action     → nothing yet; a later refund.updated settles it
 */
export async function syncRefund(stripe: Stripe, account: string, refund: Stripe.Refund): Promise<string> {
  const piId = idOf(refund.payment_intent);
  if (!piId) return `skip ${refund.id}: no payment_intent`;

  if (refund.status === 'failed' || refund.status === 'canceled') {
    const { data, error } = await adminClient()
      .from('invoice_payments').delete()
      .eq('entry_type', 'refund').eq('stripe_object_id', refund.id)
      .select('id');
    if (error) throw error;
    return data && data.length ? `${refund.id} ${refund.status}: row removed` : `${refund.id} ${refund.status}: no row`;
  }
  if (refund.status !== 'succeeded' && refund.status !== 'pending') {
    return `skip ${refund.id}: status=${refund.status}`;
  }

  const amount = usdDollars(refund.currency, refund.amount);
  if (amount === null) return `skip ${refund.id}: ${refund.currency} ${refund.amount}`;

  const found = await findLedgerPayment(stripe, account, piId);
  if ('skip' in found) return `skip ${refund.id}: ${found.skip}`;

  const inserted = await insertReversal(found.payment, 'refund', refund.id, -amount, new Date(refund.created * 1000));
  return inserted ? `refund ${refund.id} recorded −${amount}` : `refund ${refund.id} duplicate — no-op`;
}

/** charge.refunded: sync every refund on the charge (covers several partial
 *  refunds and any refund.* event that was missed). */
export async function syncChargeRefunds(stripe: Stripe, account: string, charge: Stripe.Charge): Promise<string> {
  const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 }, { stripeContext: account });
  if (!refunds.data.length) return `charge ${charge.id}: no refunds listed`;
  const outcomes: string[] = [];
  for (const r of refunds.data) outcomes.push(await syncRefund(stripe, account, r));
  return outcomes.join('; ');
}

// ── Disputes ───────────────────────────────────────────────────────

/** The PaymentIntent behind a dispute (directly, or via its charge). */
async function disputePaymentIntent(stripe: Stripe, account: string, dispute: Stripe.Dispute): Promise<string | null> {
  const direct = idOf(dispute.payment_intent);
  if (direct) return direct;
  const chargeId = idOf(dispute.charge);
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId, {}, { stripeContext: account });
  return idOf(charge.payment_intent);
}

/** The ledger payment a dispute is against, or why not. */
export async function disputedPayment(stripe: Stripe, account: string, dispute: Stripe.Dispute): Promise<Found> {
  const piId = await disputePaymentIntent(stripe, account, dispute);
  if (!piId) return { skip: 'no payment_intent' };
  return findLedgerPayment(stripe, account, piId);
}

/**
 * charge.dispute.funds_withdrawn → dispute_withdrawn (−amount)
 * charge.dispute.funds_reinstated → dispute_reinstated (+amount)
 * Dated by the event (when Stripe moved the money). The dispute amount, not
 * the dispute fee: the fee is a Stripe cost, not money the client paid.
 */
export async function recordDisputeFunds(
  stripe: Stripe,
  account: string,
  event: Stripe.Event,
  dispute: Stripe.Dispute,
  type: 'dispute_withdrawn' | 'dispute_reinstated',
): Promise<string> {
  const amount = usdDollars(dispute.currency, dispute.amount);
  if (amount === null) return `skip ${dispute.id}: ${dispute.currency} ${dispute.amount}`;

  const found = await disputedPayment(stripe, account, dispute);
  if ('skip' in found) return `skip ${dispute.id}: ${found.skip}`;

  const signed = type === 'dispute_withdrawn' ? -amount : amount;
  const inserted = await insertReversal(found.payment, type, dispute.id, signed, new Date(event.created * 1000));
  return inserted ? `${type} ${dispute.id} recorded ${signed}` : `${type} ${dispute.id} duplicate — no-op`;
}

/**
 * charge.dispute.created → "Mike Davis disputed $850" push to the owner.
 * notify() claims `dispute:<du_id>`, so retries push once. The payment lookup
 * throws like the ledger paths (→ 500 → retry); the push itself never throws.
 */
export async function notifyDisputeOpened(stripe: Stripe, account: string, dispute: Stripe.Dispute): Promise<string> {
  const amount = usdDollars(dispute.currency, dispute.amount);
  if (amount === null) return `skip ${dispute.id}: ${dispute.currency} ${dispute.amount}`;

  const found = await disputedPayment(stripe, account, dispute);
  if ('skip' in found) return `skip ${dispute.id}: ${found.skip}`;
  const { payment } = found;

  try {
    const admin = adminClient();
    const [{ data: inv }, { data: owner }] = await Promise.all([
      admin.from('invoices').select('invoice_number, client_name').eq('id', payment.invoice_id).maybeSingle(),
      admin.from('profiles').select('timezone').eq('id', payment.user_id).maybeSingle(),
    ]);
    if (!inv) return `${dispute.id}: push skipped (invoice not found)`;
    const dueBy = dispute.evidence_details?.due_by;
    const delivered = await notify(payment.user_id, {
      type: 'payment_disputed',
      disputeId: dispute.id,
      invoiceId: payment.invoice_id,
      invoiceNumber: inv.invoice_number as number,
      clientName: (inv.client_name as string) || 'Your client',
      amount,
      respondBy: dueBy ? localYmd(new Date(dueBy * 1000), owner?.timezone as string | null) : null,
    });
    return `${dispute.id} status=${dispute.status}; push ${delivered} device(s)`;
  } catch {
    return `${dispute.id} status=${dispute.status}; push failed`;
  }
}

/** yyyy-mm-dd of `d` in an IANA timezone (UTC when unknown or invalid). */
function localYmd(d: Date, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// GET  /api/plaid/deposits — money in the owner can still decide about.
// POST /api/plaid/deposits — one decision on one deposit.
//
//   { deposit_id, action: 'record' | 'already' | 'ignored' | 'classified',
//     invoice_id?, payment_id?, classification? }
//
//   record      write ONE invoice_payments row (method 'bank', paid_source
//               'manual', idempotency_key 'bank:<deposit id>'), then link it as
//               'recorded'. A repeat tap adopts the row the key already owns.
//   already     link an existing ledger row as 'linked'. No new ledger row.
//   ignored     Don't add. Stored as 'ignored'.
//   classified  Other money received. An income classification
//               (customer_payment | other_income) writes an other_income row;
//               the four non-income ones write a 'classified' link and count in
//               no total at all.
//
// ONE DEPOSIT, ONE DECISION. A deposit is decided by a link row or an
// other_income row, never both. Checked here and enforced again by the trigger.
//
// Stripe: only the descriptor is stored, and a descriptor is not proof. On It
// keeps no payout record, so there is NO sure match: every STRIPE deposit goes
// to To review with STRIPE_PAYOUT_CAUTION, "already" is offered (the lump is
// made of card payments already in the ledger) and a NEW payment is refused.
// A payout can therefore never become income, and nothing is auto-filed away
// on a guess. `kind = 'stripe_payout'` stays in the check for the day a
// verified payout record exists; this route does not write it.
//
// Ownership is always user.id, on every read and every write. The rows the
// client sends are ids only; the amount and the date come from the deposit.
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. Every non-2xx
// goes through fail(), which logs exactly one line.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { fail } from '@/lib/plaid/respond';
import { centsToAmount, parseCents } from '@/lib/plaid/match';
import {
  depositLinkRefusal, STRIPE_PAYOUT_CAUTION, stripePayoutVerdict,
} from '@/lib/plaid/payouts';
import {
  depositPaymentKey, depositPaymentRow,
} from '@/lib/plaid/deposit-ledger';
import {
  openBalanceCents, suggestDepositInvoice, type SuggestInvoice,
} from '@/lib/plaid/deposit-suggest';
import {
  countsAsIncome, incomeClassification, isClassification, otherIncomeFromDeposit,
} from '@/lib/other-income';

export const runtime = 'nodejs';

const MAX_ROWS = 100;

const Body = z.object({
  deposit_id: z.string().uuid(),
  action: z.enum(['record', 'already', 'ignored', 'classified']),
  invoice_id: z.string().uuid().optional(),
  payment_id: z.string().uuid().optional(),
  classification: z.string().optional(),
});

type DepositRow = {
  id: string;
  name: string;
  merchant_name: string | null;
  amount: string | number;
  occurred_on: string;
  pending: boolean;
  removed_at: string | null;
  is_stripe_payout: boolean;
};

type LinkRow = { kind: string; payment_id: string | null; classification: string | null };

const DEPOSIT_SELECT = 'id, name, merchant_name, amount, occurred_on, pending, removed_at, is_stripe_payout';

/** The Stripe columns a ledger row must NOT carry to be claimable by a deposit. */
const STRIPE_SELECT = 'stripe_checkout_session_id, stripe_event_id, stripe_payment_intent_id, stripe_object_id';

export async function GET(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('deposits', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('deposits', 'unauthorized');

  if (!(await rateLimit('plaid_deposits', rateIdentifier(req, user.id)))) {
    return fail('deposits', 'rate_limited');
  }

  // RLS is the boundary here: owner-only SELECT, no admin key.
  const { data: depositRows, error: depositError } = await supabase
    .from('bank_deposits')
    .select(`${DEPOSIT_SELECT}, bank_deposit_links(kind, payment_id, classification)`)
    .eq('user_id', user.id)
    .order('occurred_on', { ascending: false })
    .limit(MAX_ROWS);
  if (depositError) return fail('deposits', 'db_read_failed', depositError.code);

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, total, amount_paid, kind, deleted_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .neq('kind', 'quote')
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  if (invoiceError) return fail('deposits', 'db_read_failed', invoiceError.code);

  const openInvoices = ((invoiceRows ?? []) as unknown as (SuggestInvoice & { client_name: string | null })[])
    .filter((invoice) => {
      const balance = openBalanceCents(invoice);
      return balance !== null && balance > 0;
    });

  const { data: linkedRows, error: linkedError } = await supabase
    .from('bank_deposit_links')
    .select('payment_id')
    .eq('user_id', user.id)
    .not('payment_id', 'is', null);
  if (linkedError) return fail('deposits', 'db_read_failed', linkedError.code);
  const linkedPaymentIds = new Set(
    ((linkedRows ?? []) as unknown as { payment_id: string | null }[])
      .map((row) => row.payment_id)
      .filter((id): id is string => typeof id === 'string'),
  );

  // A deposit decided as income lives in other_income, not in a link row.
  const { data: incomeRows, error: incomeError } = await supabase
    .from('other_income')
    .select('deposit_id')
    .eq('user_id', user.id)
    .is('deleted_at', null);
  if (incomeError) return fail('deposits', 'db_read_failed', incomeError.code);
  const incomeDepositIds = new Set(
    ((incomeRows ?? []) as unknown as { deposit_id: string | null }[])
      .map((row) => row.deposit_id)
      .filter((id): id is string => typeof id === 'string'),
  );

  const { data: paymentRows, error: paymentError } = await supabase
    .from('invoice_payments')
    .select(`id, invoice_id, amount, method, paid_at, entry_type, ${STRIPE_SELECT}`)
    .eq('user_id', user.id)
    .eq('entry_type', 'payment')
    .order('paid_at', { ascending: false })
    .limit(MAX_ROWS);
  if (paymentError) return fail('deposits', 'db_read_failed', paymentError.code);

  type PaymentRow = {
    id: string; invoice_id: string; amount: string | number; method: string; paid_at: string;
    stripe_checkout_session_id: string | null; stripe_event_id: string | null;
    stripe_payment_intent_id: string | null; stripe_object_id: string | null;
  };
  const manualPayments = ((paymentRows ?? []) as unknown as PaymentRow[]).filter((row) =>
    centsOf(row.amount) !== null && (centsOf(row.amount) as number) > 0
    && !linkedPaymentIds.has(row.id)
    && !row.stripe_checkout_session_id && !row.stripe_event_id
    && !row.stripe_payment_intent_id && !row.stripe_object_id);

  const invoiceById = new Map(
    ((invoiceRows ?? []) as unknown as { id: string; invoice_number: number | null }[])
      .map((invoice) => [invoice.id, invoice.invoice_number]),
  );

  const deposits = ((depositRows ?? []) as unknown as (DepositRow & { bank_deposit_links?: LinkRow[] })[])
    .map((row) => {
      const links = Array.isArray(row.bank_deposit_links) ? row.bank_deposit_links : [];
      const cents = parseCents(row.amount);
      if (cents === null || cents <= 0) return null;
      const suggestion = suggestDepositInvoice(
        { name: row.name, merchant_name: row.merchant_name, amount_cents: cents },
        openInvoices,
      );
      const payout = stripePayoutVerdict({
        name: row.name,
        merchant_name: row.merchant_name,
        is_stripe_payout: row.is_stripe_payout,
      });
      return {
        id: row.id,
        name: row.name,
        merchant: row.merchant_name,
        amount_cents: cents,
        occurred_on: row.occurred_on,
        pending: row.pending === true,
        removed: row.removed_at !== null,
        is_stripe_payout: row.is_stripe_payout === true,
        payout,
        accounted: links.length > 0 || incomeDepositIds.has(row.id),
        link: links[0]
          ? {
            kind: links[0].kind,
            payment_id: links[0].payment_id,
            classification: links[0].classification,
          }
          : null,
        suggestion: suggestion
          ? {
            invoice_id: suggestion.invoice_id,
            invoice_number: invoiceById.get(suggestion.invoice_id) ?? null,
            reason: suggestion.reason,
          }
          : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    // Undecided, or decided but the bank removed the deposit: a look is needed.
    .filter((row) => !row.accounted || row.removed);

  return NextResponse.json({
    deposits,
    invoices: openInvoices.slice(0, 50).map((invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: (invoice as unknown as { client_name: string | null }).client_name,
      balance_cents: openBalanceCents(invoice),
    })),
    payments: manualPayments.slice(0, 50).map((row) => ({
      id: row.id,
      invoice_number: invoiceById.get(row.invoice_id) ?? null,
      amount_cents: centsOf(row.amount),
      method: row.method,
      paid_at: row.paid_at,
    })),
    note: STRIPE_PAYOUT_CAUTION,
  });
}

function centsOf(value: string | number | null | undefined): number | null {
  return parseCents(value);
}

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('deposits', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('deposits', 'unauthorized');

  if (!(await rateLimit('plaid_deposits', rateIdentifier(req, user.id)))) {
    return fail('deposits', 'rate_limited');
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('deposits', 'invalid_request');
  const { deposit_id: depositId, action } = parsed.data;
  if (action === 'classified' && !isClassification(parsed.data.classification)) {
    return fail('deposits', 'invalid_request');
  }

  const admin = adminClient();

  const { data: depositData, error: depositError } = await admin
    .from('bank_deposits')
    .select(DEPOSIT_SELECT)
    .eq('id', depositId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (depositError) return fail('deposits', 'db_read_failed', depositError.code);
  const deposit = depositData as unknown as DepositRow | null;
  // Another owner's deposit and a missing one are the same answer.
  if (!deposit) return fail('deposits', 'not_found');

  const depositCents = parseCents(deposit.amount);
  if (depositCents === null || depositCents <= 0) return fail('deposits', 'invalid_request');

  // Derived here from the stored descriptors, never sent by the client.
  const verdict = stripePayoutVerdict({
    name: deposit.name,
    merchant_name: deposit.merchant_name,
    is_stripe_payout: deposit.is_stripe_payout,
  });

  // One decision per deposit, across both tables.
  const { data: existingLinks, error: linkReadError } = await admin
    .from('bank_deposit_links')
    .select('kind, payment_id, classification')
    .eq('deposit_id', deposit.id)
    .eq('user_id', user.id);
  if (linkReadError) return fail('deposits', 'db_read_failed', linkReadError.code);
  const links = (existingLinks ?? []) as unknown as LinkRow[];

  const { data: existingIncome, error: incomeReadError } = await admin
    .from('other_income')
    .select('id')
    .eq('deposit_id', deposit.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (incomeReadError) return fail('deposits', 'db_read_failed', incomeReadError.code);
  const hasIncome = (existingIncome as { id?: string } | null)?.id !== undefined;

  if (action === 'ignored') {
    // Don't add. One terminal decision per deposit; a replay is a success.
    if (links.some((link) => link.kind === 'ignored' || link.kind === 'stripe_payout')) {
      return NextResponse.json({ ok: true, deposit_id: deposit.id, kind: 'ignored', payment_id: null });
    }
    if (links.length > 0 || hasIncome) return fail('deposits', 'deposit_already_decided');

    const { error: insertError } = await admin
      .from('bank_deposit_links')
      .insert({ user_id: user.id, deposit_id: deposit.id, payment_id: null, kind: 'ignored' });
    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ ok: true, deposit_id: deposit.id, kind: 'ignored', payment_id: null });
      }
      if (insertError.code === '23514') return fail('deposits', 'deposit_link_refused');
      return fail('deposits', 'db_insert_failed', insertError.code);
    }
    return NextResponse.json({ ok: true, deposit_id: deposit.id, kind: 'ignored', payment_id: null });
  }

  if (action === 'classified') {
    const classification = parsed.data.classification as string;
    const counts = countsAsIncome(classification);

    // A STRIPE descriptor is never income, whichever of the six is picked.
    if (counts && verdict !== 'not_stripe') return fail('deposits', 'payout_not_income');

    // Replays: the same classification already stored is a success.
    if (links.some((link) => link.kind === 'classified'
      && link.classification === classification)) {
      return NextResponse.json({
        ok: true, deposit_id: deposit.id, kind: 'classified',
        payment_id: null, classification,
      });
    }
    if (links.length > 0 || hasIncome) return fail('deposits', 'deposit_already_decided');

    const income = incomeClassification(classification);
    if (income) {
      // The income side: a real other_income row, and never a ledger row.
      const { error: incomeInsertError } = await admin
        .from('other_income')
        .insert(otherIncomeFromDeposit({
          userId: user.id,
          depositId: deposit.id,
          amount: centsToAmount(depositCents),
          title: deposit.name,
          receivedOn: deposit.occurred_on,
          classification: income,
        }));
      if (incomeInsertError) {
        if (incomeInsertError.code === '23505') {
          return fail('deposits', 'deposit_already_decided');
        }
        if (incomeInsertError.code === '23514') {
          return fail('deposits', 'deposit_link_refused');
        }
        return fail('deposits', 'db_insert_failed', incomeInsertError.code);
      }
      return NextResponse.json({
        ok: true, deposit_id: deposit.id, kind: 'other_income',
        payment_id: null, classification,
      });
    }

    const { error: classifiedError } = await admin
      .from('bank_deposit_links')
      .insert({
        user_id: user.id,
        deposit_id: deposit.id,
        payment_id: null,
        kind: 'classified',
        classification,
      });
    if (classifiedError) {
      if (classifiedError.code === '23505') return fail('deposits', 'deposit_already_decided');
      if (classifiedError.code === '23514') return fail('deposits', 'deposit_link_refused');
      return fail('deposits', 'db_insert_failed', classifiedError.code);
    }
    return NextResponse.json({
      ok: true, deposit_id: deposit.id, kind: 'classified',
      payment_id: null, classification,
    });
  }

  // record / already: a STRIPE descriptor (no new payment), or a removed
  // deposit, refuses before any write.
  const refusal = depositLinkRefusal(deposit, verdict, action);
  if (refusal === 'stripe_payout') return fail('deposits', 'payout_not_income');
  if (refusal === 'removed') return fail('deposits', 'bad_state');
  if (links.length > 0 || hasIncome) return fail('deposits', 'deposit_already_decided');

  if (action === 'record') {
    const invoiceId = parsed.data.invoice_id;
    if (!invoiceId) return fail('deposits', 'invalid_request');

    const { data: invoiceData, error: invoiceError } = await admin
      .from('invoices')
      .select('id, user_id, kind, deleted_at')
      .eq('id', invoiceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (invoiceError) return fail('deposits', 'db_read_failed', invoiceError.code);
    const invoice = invoiceData as unknown as
      { id: string; kind: string | null; deleted_at: string | null } | null;
    if (!invoice || invoice.deleted_at) return fail('deposits', 'not_found');
    if (invoice.kind === 'quote') return fail('deposits', 'invalid_request');

    // The ledger row, once. A retry adopts the row this key already owns.
    const key = depositPaymentKey(deposit.id);
    let paymentId: string | null = null;
    let created = false;

    const { data: previous, error: previousError } = await admin
      .from('invoice_payments')
      .select('id')
      .eq('user_id', user.id)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (previousError) return fail('deposits', 'db_read_failed', previousError.code);
    paymentId = (previous as { id?: string } | null)?.id ?? null;

    if (!paymentId) {
      const row = depositPaymentRow({
        userId: user.id,
        invoiceId: invoice.id,
        depositId: deposit.id,
        amountCents: depositCents,
        occurredOn: deposit.occurred_on,
      });
      const { data: inserted, error: insertError } = await admin
        .from('invoice_payments')
        .insert(row)
        .select('id')
        .maybeSingle();

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: replay, error: replayError } = await admin
            .from('invoice_payments')
            .select('id')
            .eq('user_id', user.id)
            .eq('idempotency_key', key)
            .maybeSingle();
          if (replayError) return fail('deposits', 'db_read_failed', replayError.code);
          paymentId = (replay as { id?: string } | null)?.id ?? null;
          if (!paymentId) return fail('deposits', 'db_insert_failed', insertError.code);
        } else if (insertError.code === '23514') {
          // guard_invoice_payment_overpay: the invoice's remaining balance.
          return fail('deposits', 'over_limit');
        } else {
          return fail('deposits', 'db_insert_failed', insertError.code);
        }
      } else {
        paymentId = (inserted as { id?: string } | null)?.id ?? null;
        created = paymentId !== null;
        if (!paymentId) return fail('deposits', 'db_insert_failed');
      }
    }

    const { error: linkError } = await admin
      .from('bank_deposit_links')
      .insert({ user_id: user.id, deposit_id: deposit.id, payment_id: paymentId, kind: 'recorded' });

    if (linkError) {
      // A replay whose link already landed is a success.
      if (linkError.code === '23505') {
        const { data: existingLink, error: existingLinkError } = await admin
          .from('bank_deposit_links')
          .select('deposit_id')
          .eq('payment_id', paymentId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (existingLinkError) return fail('deposits', 'db_read_failed', existingLinkError.code);
        if ((existingLink as { deposit_id?: string } | null)?.deposit_id === deposit.id) {
          return NextResponse.json({
            ok: true, deposit_id: deposit.id, kind: 'recorded', payment_id: paymentId,
          });
        }
        if (created) {
          await admin.from('invoice_payments').delete()
            .eq('id', paymentId).eq('user_id', user.id).eq('idempotency_key', key);
        }
        return fail('deposits', 'payment_taken');
      }
      // A refused link never leaves a ledger row the owner cannot see.
      if (created) {
        await admin.from('invoice_payments').delete()
          .eq('id', paymentId).eq('user_id', user.id).eq('idempotency_key', key);
      }
      if (linkError.code === '23514') return fail('deposits', 'deposit_link_refused');
      return fail('deposits', 'db_insert_failed', linkError.code);
    }

    return NextResponse.json({
      ok: true, deposit_id: deposit.id, kind: 'recorded', payment_id: paymentId,
    });
  }

  // already: an existing ledger row, the caller's, never a Stripe row.
  const paymentId = parsed.data.payment_id;
  if (!paymentId) return fail('deposits', 'invalid_request');

  const { data: paymentData, error: paymentError } = await admin
    .from('invoice_payments')
    .select(`id, user_id, amount, entry_type, ${STRIPE_SELECT}, reverses_payment_id`)
    .eq('id', paymentId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (paymentError) return fail('deposits', 'db_read_failed', paymentError.code);

  type Payment = {
    id: string; amount: string | number; entry_type: string | null;
    stripe_checkout_session_id: string | null; stripe_event_id: string | null;
    stripe_payment_intent_id: string | null; stripe_object_id: string | null;
    reverses_payment_id: string | null;
  };
  const payment = paymentData as unknown as Payment | null;
  if (!payment) return fail('deposits', 'not_found');

  const paymentCents = parseCents(payment.amount);
  if (payment.entry_type !== 'payment' || paymentCents === null || paymentCents <= 0) {
    return fail('deposits', 'bad_state');
  }
  if (payment.stripe_checkout_session_id || payment.stripe_event_id
    || payment.stripe_payment_intent_id || payment.stripe_object_id
    || payment.reverses_payment_id) {
    // A Stripe-written row is not something a deposit can claim.
    return fail('deposits', 'bad_state');
  }

  const { error: linkError } = await admin
    .from('bank_deposit_links')
    .insert({ user_id: user.id, deposit_id: deposit.id, payment_id: payment.id, kind: 'linked' });

  if (linkError) {
    if (linkError.code === '23505') {
      const { data: existingLink, error: existingLinkError } = await admin
        .from('bank_deposit_links')
        .select('deposit_id')
        .eq('payment_id', payment.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existingLinkError) return fail('deposits', 'db_read_failed', existingLinkError.code);
      if ((existingLink as { deposit_id?: string } | null)?.deposit_id === deposit.id) {
        return NextResponse.json({
          ok: true, deposit_id: deposit.id, kind: 'linked', payment_id: payment.id,
        });
      }
      return fail('deposits', 'payment_taken');
    }
    if (linkError.code === '23514') return fail('deposits', 'deposit_link_refused');
    return fail('deposits', 'db_insert_failed', linkError.code);
  }

  return NextResponse.json({
    ok: true, deposit_id: deposit.id, kind: 'linked', payment_id: payment.id,
  });
}

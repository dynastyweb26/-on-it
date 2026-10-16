// GET /api/subscription/cancel-summary — everything the Plan and cancel
// screens render, from the server (CANCEL-FLOW-SPEC.md §2; spec test 10: a
// hard refresh mid-flow shows server state, not local state).
//
// Session client only (RLS: the caller's own rows). No Stripe call: the
// profile mirrors the subscription (webhook + /api/subscription/* write it).
// offerEligible here is for display; the offer route re-checks it against
// the live Stripe subscription.
//
// Stats sources (PUNCH-LIST "Cancel flow" audit, item 4):
//   invoices sent   kind='invoice', first_sent_at set (sent_at is "last shared")
//   collected       invoice_payments joined to live invoices — the Books query
//   days to paid    status='paid' invoices: paid_at - first_sent_at
//   clients saved   saved_at set, not deleted (the Clients tab / Settings count)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { displayLimit } from '@/lib/access';
import { offerEligible } from '@/lib/subscription/offers';
import { DAY_MS, statTiles } from '@/lib/subscription/stats';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('subscription_read', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const { data: p, error } = await supabase
    .from('profiles')
    .select('access_tier, subscription_status, cancel_at_period_end, paused_until, retention_offer_used_at, current_period_end, trial_ends_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error || !p) return NextResponse.json({ error: 'unavailable' }, { status: 500 });

  const tier = (p.access_tier as string | null) ?? 'free';
  const status = (p.subscription_status as string | null) ?? null;
  const pausedUntil = (p.paused_until as string | null) ?? null;
  const cancelAtPeriodEnd = Boolean(p.cancel_at_period_end);
  const endsAt = (status === 'trialing' ? p.trial_ends_at : p.current_period_end) as string | null ?? null;

  // Founders (and anyone without a live subscription) have nothing to cancel;
  // the screen redirects to Plan. Skip the stats work.
  const subscribed = tier !== 'founder' && (status === 'trialing' || status === 'active' || status === 'past_due');
  if (!subscribed) {
    return NextResponse.json({ tier, status, subscribed: false, cancelAtPeriodEnd, pausedUntil, endsAt });
  }

  const [sent, pays, paid, clients, invLimit, expLimit] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true })
      .eq('kind', 'invoice').not('first_sent_at', 'is', null).is('deleted_at', null),
    supabase.from('invoice_payments')
      .select('amount, invoices!inner(kind, deleted_at)')
      .eq('invoices.kind', 'invoice')
      .is('invoices.deleted_at', null),
    supabase.from('invoices').select('first_sent_at, paid_at')
      .eq('kind', 'invoice').eq('status', 'paid').is('deleted_at', null)
      .not('first_sent_at', 'is', null).not('paid_at', 'is', null)
      .limit(5000),
    supabase.from('clients').select('id', { count: 'exact', head: true })
      .not('saved_at', 'is', null).is('deleted_at', null),
    supabase.rpc('free_invoice_limit'),
    supabase.rpc('free_expense_limit'),
  ]);

  const tiles = statTiles({
    invoicesSent: sent.count ?? 0,
    collected: (pays.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
    daysToPaid: (paid.data ?? []).map((r) => (Date.parse(r.paid_at as string) - Date.parse(r.first_sent_at as string)) / DAY_MS),
    clientsSaved: clients.count ?? 0,
  });

  return NextResponse.json({
    tier,
    status,
    subscribed: true,
    cancelAtPeriodEnd,
    pausedUntil,
    endsAt,
    offerEligible: offerEligible({
      status: status ?? '',
      cancelAtPeriodEnd,
      paused: Boolean(pausedUntil),
      retentionOfferUsedAt: (p.retention_offer_used_at as string | null) ?? null,
    }),
    tiles,
    freeLimits: { invoices: displayLimit(invLimit.data), expenses: displayLimit(expLimit.data) },
  });
}

// GET /api/prompts — the soft upgrade prompts due when the app opens.
//
// Read-only, RLS-scoped. The tier comes from hasAccess() (the ONE access
// source) — never a second read of profiles.access_tier and never a copy of
// the tier rules. Whether a prompt was already seen is the device's business
// (localStorage), so the route only decides what is ELIGIBLE and returns it in
// PRIORITY ORDER; the client shows the first one still due.
//
//   winback       (canceled)                        → banner, once per 14 days
//   first-payment (free / canceled, first payment)  → banner, once ever
//
// Nothing here is a wall: the client opens the existing paywall.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasAccess } from '@/lib/access';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import { firstPaymentPrompt, winbackPrompt, type SoftPrompt } from '@/lib/soft-prompts';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('prompts', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  // Paywall off: nothing here is about upgrading.
  if (!PAYWALL_ENABLED) return NextResponse.json({ prompts: [] }, NO_STORE);

  const access = await hasAccess(user.id);
  const prompts: SoftPrompt[] = [];

  // Non-paid users only (free and canceled); founder, trialing, active and
  // past_due are gated out by hasAccess()'s tier, not by a second check here.

  // A lapsed customer hears about it at most once per 14 days, and that beats
  // the first-payment note below (one banner at a time, in priority order).
  if (access.tier === 'canceled') prompts.push(winbackPrompt());

  if (access.tier === 'free' || access.tier === 'canceled') {
    // The FIRST ledger payment this user ever recorded. `entry_type` filters
    // out refund / dispute reversals; one row means the moment just happened,
    // more than one means it has passed (never nudge a late "first").
    const { count } = await supabase
      .from('invoice_payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('entry_type', 'payment');
    if (count === 1) prompts.push(firstPaymentPrompt());
  }

  return NextResponse.json({ prompts }, NO_STORE);
}

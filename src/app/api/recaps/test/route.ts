// GET  /api/recaps/test — is the recap test tool available here? { enabled }
// POST /api/recaps/test — the caller's own recaps, for testing the in-app
// access on a preview with real data (the daily cron runs in production only):
//   { action: 'build' } — build (insert-once) the caller's recaps for the
//     last 4 completed weeks and 2 completed months, with the cron's own
//     builder (buildOwnerRecaps): same numbers, payload, paid-only rule and
//     "never active" skip. Existing snapshots are left untouched.
//   { action: 'push' }  — send the recap push for the caller's newest
//     announcing recap to THIS environment's devices (notifyTest: a test log
//     row, never the real recap:<kind>:<user>:<period> dedupe key).
//   { action: 'reset' } — clear seen_at / prompted_at on the caller's recaps
//     (the two columns the app itself writes), so the prompt and dot show again.
//   { action: 'delete' } — delete the caller's recaps rows (all kinds and
//     periods), so 'build' starts from nothing. Clients have no DELETE on
//     recaps (by design, 20261001000010), so this runs with the service role,
//     scoped to the session user's id — never an id from the request.
//
// Preview-only by three gates: never in production (VERCEL_ENV), only where
// PUSH_TEST_ENABLED=1 (Preview only, shared with /api/push/test), and only
// with RECAPS_LIVE on. Anywhere else both methods 404. Session-gated: only
// the caller's own rows. Preview shares the production DB, so 'build' writes
// real recaps rows for the caller (the same rows the cron would write).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { deployEnv } from '@/lib/deploy-env';
import { notifyTest } from '@/lib/notify';
import { buildOwnerRecaps } from '@/lib/notify/recaps';
import { PAYWALL_ENABLED, isPaidTier } from '@/lib/paywall';
import { RECAPS_LIVE } from '@/lib/recaps-live';
import { localYmd, recentPeriods, resolveTimeZone } from '@/lib/recap/dates';
import { RECAP_FULL_COLS, announces, normalizeRow, sortRows } from '@/lib/recap/rows';

const Body = z.object({ action: z.enum(['build', 'push', 'reset', 'delete']) });

const enabled = () => deployEnv() !== 'production' && process.env.PUSH_TEST_ENABLED === '1' && RECAPS_LIVE;
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET() {
  if (!enabled()) return notFound();
  return NextResponse.json({ enabled: true });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('push_test', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const { action } = parsed.data;

  if (action === 'reset') {
    const { error } = await supabase.from('recaps')
      .update({ seen_at: null, prompted_at: null })
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: 'reset failed' }, { status: 500 });
    return NextResponse.json({ reset: true });
  }

  if (action === 'delete') {
    const { data, error } = await adminClient().from('recaps').delete().eq('user_id', user.id).select('id');
    if (error) return NextResponse.json({ error: 'delete failed' }, { status: 500 });
    return NextResponse.json({ deleted: data?.length ?? 0 });
  }

  if (action === 'push') {
    const { data } = await supabase.from('recaps').select(RECAP_FULL_COLS)
      .order('period_end', { ascending: false }).limit(12);
    const pick = sortRows((data ?? []).map(normalizeRow)).find(announces);
    if (!pick) return NextResponse.json({ error: 'no recap to announce — build first' }, { status: 404 });
    const delivered = await notifyTest(user.id, { type: 'recap', recapId: pick.id, kind: pick.kind, periodStart: pick.period_start });
    return NextResponse.json({ delivered, kind: pick.kind, periodStart: pick.period_start });
  }

  // build
  const { data: prof } = await supabase.from('profiles').select('timezone, access_tier').eq('id', user.id).maybeSingle();
  if (PAYWALL_ENABLED && !isPaidTier((prof?.access_tier as string | null) ?? null)) {
    return NextResponse.json({ error: 'recaps are paid-only; this account is on the free plan' }, { status: 403 });
  }
  const tz = resolveTimeZone((prof?.timezone as string | null) ?? null);
  const periods = recentPeriods(localYmd(tz, new Date()), 4, 2);
  const r = await buildOwnerRecaps(adminClient(), user.id, tz, periods);
  if (r.inactive) return NextResponse.json({ error: 'no invoices or expenses yet' }, { status: 409 });
  return NextResponse.json({ built: r.built, existing: r.existing, quiet: r.quiet, periods: periods.length });
}

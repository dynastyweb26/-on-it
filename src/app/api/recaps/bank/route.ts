// GET /api/recaps/bank?id=<recap id>
// Slides 07 and 08 for the viewer opening a recap: payments and expenses
// recorded in its period, how many came from a bank row, which bank, and what
// is still unaccounted for. Counts only — the design prints no money.
//
// Composed on the request with the viewer's OWN session client, so RLS is the
// boundary: the admin key / service role is never used here. Every gate runs
// first — the plan must include bank activity and a bank must be connected —
// otherwise the body is {} and the payload's fields stay absent. A recap the
// caller does not own reads as no row. Node runtime.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { loadRecapBank } from '@/lib/recap/bank-server';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('recap_bank', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // RLS: only the owner's own recap comes back; another owner's id reads as none.
  // The two counts are the story's own numbers (collected payments, all sources;
  // recorded expenses), read as JSON paths so the payload never travels.
  const { data: row, error } = await supabase
    .from('recaps')
    .select('id, period_start, period_end, p_pay:payload->collected->>payments, p_inc:payload->income->>payments, p_exp:payload->spend->>count')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[recap-bank] recap read failed', error.code ?? error.message);
    return NextResponse.json({});
  }
  if (!row) return NextResponse.json({});

  const count = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };

  return NextResponse.json(await loadRecapBank(
    supabase,
    user.id,
    { start: row.period_start as string, end: row.period_end as string },
    { in: count(row.p_pay ?? row.p_inc), out: count(row.p_exp) },
  ));
}

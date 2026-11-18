// GET /api/recaps/bank?id=<recap id>
// The two bank slides' numbers for the viewer opening a recap: what the bank
// picked up inside that recap's period (money in and money out), and what is
// still unaccounted for.
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
  const { data: row, error } = await supabase
    .from('recaps')
    .select('id, period_start, period_end')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[recap-bank] recap read failed', error.code ?? error.message);
    return NextResponse.json({});
  }
  if (!row) return NextResponse.json({});

  return NextResponse.json(await loadRecapBank(supabase, user.id, {
    start: row.period_start as string,
    end: row.period_end as string,
  }));
}

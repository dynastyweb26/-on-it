// GET  /api/recurring/test — is the test run available here? { enabled }
// POST /api/recurring/test — run the recurring cron step (lib/notify/recurring)
//                            for the caller's own items only.
//
// Preview only: gated strictly on VERCEL_ENV === 'preview' (not production,
// not local development). Anywhere else both methods 404, as if the route
// didn't exist. Preview shares the production DB, so this writes REAL rows —
// expenses and item stamps — but only the signed-in caller's (onlyUserId;
// the session is the only source of the user). A digest push it sends
// claims that day's real dedupe key for the caller, like /api/push/test's
// draft_run.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { runRecurring } from '@/lib/notify/recurring';

const enabled = () => process.env.VERCEL_ENV === 'preview';
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

  return NextResponse.json({ recurring: await runRecurring({ onlyUserId: user.id }) });
}

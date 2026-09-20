// GET /api/access — the client's read-only window into hasAccess().
// The chat paywall gate fetches this before creating an invoice; the access
// logic itself is server-only (RLS-scoped DB reads).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasAccess } from '@/lib/access';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Rate-limit access checks to prevent excessive polling and database query spam.
  if (!(await rateLimit('access', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  return NextResponse.json(await hasAccess(user.id));
}

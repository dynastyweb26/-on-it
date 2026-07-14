// GET /api/access — the client's read-only window into hasAccess().
// The chat paywall gate fetches this before creating an invoice; the access
// logic itself is server-only (RLS-scoped DB reads).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasAccess } from '@/lib/access';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  return NextResponse.json(await hasAccess(user.id));
}

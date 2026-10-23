// GET /api/estimates/[id]/preview — the owner sees exactly what the client
// will see, including a draft that has not been sent yet. The payload is the
// public shape (no owner id, storage paths or client phone/email) so a preview
// cannot drift from the real page.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadOwnerEstimatePreview } from '@/lib/estimates/public';
import { isUuid } from '@/lib/estimates/owner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const estimate = await loadOwnerEstimatePreview(params.id, user.id);
    if (!estimate) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(estimate, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('estimate preview: load failed', (e as Error)?.message);
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}

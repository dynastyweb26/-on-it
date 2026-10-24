// POST /api/estimates/[id]/revoke — close an estimate's public link.
// Terminal: the public page becomes unavailable. A signed estimate cannot be
// revoked (the signed copy stays viewable forever), nor can a converted one.
// Revoking twice is idempotent.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (quote.approved_at) return refuse(409, 'approved');
    if (quote.revoked_at) {
      return NextResponse.json({ estimate: { id: quote.id, revoked_at: quote.revoked_at } });
    }
    if (await isLocked(quote)) return refuse(409, 'converted');

    const revokedAt = new Date().toISOString();
    const { data: updated, error } = await adminClient()
      .from('invoices')
      .update({ revoked_at: revokedAt })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .select('id, revoked_at, status, approved_at')
      .maybeSingle();
    if (error) {
      console.error('estimate revoke: update failed', error);
      return refuse(500, 'revoke_failed');
    }
    if (!updated) return refuse(404, 'not_found');
    return NextResponse.json({ estimate: updated });
  } catch (e) {
    console.error('estimate revoke: failed', e);
    return refuse(500, 'revoke_failed');
  }
}

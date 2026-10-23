// DELETE /api/estimates/[id]/attachments/[attachmentId] — remove one file.
// Refused once the estimate is approved or converted. Service role on purpose:
// the row and its private object must disappear together, and the DB guard
// trigger exempts server callers so account deletion still cascades.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { ATTACHMENT_BUCKET } from '@/lib/estimates/limits';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id) || !isUuid(params.attachmentId)) {
    return refuse(404, 'not_found');
  }

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (await isLocked(quote)) return refuse(409, 'locked');

    const admin = adminClient();
    const { data: row, error } = await admin
      .from('invoice_attachments')
      .select('id, storage_path, invoice_id, user_id')
      .eq('id', params.attachmentId)
      .eq('invoice_id', params.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('estimate attachment delete: read failed', error);
      return refuse(500, 'delete_failed');
    }
    if (!row) return refuse(404, 'not_found');

    const { error: deleteError } = await admin
      .from('invoice_attachments')
      .delete()
      .eq('id', params.attachmentId)
      .eq('user_id', user.id);
    if (deleteError) {
      console.error('estimate attachment delete: row delete failed', deleteError);
      return refuse(500, 'delete_failed');
    }

    const { error: removeError } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .remove([(row as { storage_path: string }).storage_path]);
    if (removeError) {
      // The row is gone; an orphan object is invisible to every reader.
      console.error('estimate attachment delete: object remove failed', removeError.message);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('estimate attachment delete: failed', e);
    return refuse(500, 'delete_failed');
  }
}

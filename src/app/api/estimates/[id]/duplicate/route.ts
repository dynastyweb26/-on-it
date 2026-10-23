// POST /api/estimates/[id]/duplicate — copy an APPROVED estimate into a fresh
// draft estimate (items, notes, title and attachments) and open it.
//
// Attachments go through the same server-verified path as an upload: the object
// is copied inside the bucket under the new estimate's folder, then
// add_estimate_attachment writes the row with the original checksum/size/mime.
// A client-side copy would be refused by the M2 guard (verification columns are
// server-owned), which is exactly why this lives on the server.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { ATTACHMENT_BUCKET, ALLOWED_ATTACHMENT_MIME } from '@/lib/estimates/limits';
import { deliverableAttachments } from '@/lib/estimates/deliverable';
import { isUuid, loadOwnedQuote } from '@/lib/estimates/owner';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

type AttachmentRow = {
  id: string;
  storage_path: string;
  position: number;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
  caption: string | null;
};

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');
  if (!(await rateLimit('estimate_edit', rateIdentifier(req, user.id)))) {
    return refuse(429, 'rate_limited');
  }

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    // Convert-to-invoice is the approved estimate's other path; duplicate is for
    // making a new draft from a signed one.
    if (!quote.approved_at) return refuse(409, 'not_approved');

    const admin = adminClient();
    const { data: created, error: insertError } = await admin
      .from('invoices')
      .insert({
        user_id: user.id,
        client_id: (quote.client_id as string | null) ?? null,
        kind: 'quote',
        status: 'draft',
        client_name: quote.client_name ?? null,
        client_address: quote.client_address ?? null,
        client_phone: quote.client_phone ?? null,
        line_items: quote.line_items ?? [],
        subtotal: quote.subtotal ?? 0,
        tax_rate: quote.tax_rate ?? 0,
        tax_amount: quote.tax_amount ?? 0,
        total: quote.total ?? 0,
        notes: quote.notes ?? null,
        title: quote.title ?? null,
      })
      .select('id, invoice_number')
      .single();

    if (insertError) {
      if (insertError.hint === 'PAYWALL_LIMIT') return refuse(402, 'paywall');
      console.error('estimate duplicate: insert failed', insertError);
      return refuse(500, 'duplicate_failed');
    }
    if (!created) return refuse(500, 'duplicate_failed');

    const newId = created.id as string;
    const copiedPaths: string[] = [];

    const rollback = async () => {
      try {
        await admin.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', newId);
        if (copiedPaths.length) {
          await admin.storage.from(ATTACHMENT_BUCKET).remove(copiedPaths);
        }
      } catch (e) {
        console.error('estimate duplicate: rollback failed', e);
      }
    };

    const { data: rows, error: rowsError } = await admin
      .from('invoice_attachments')
      .select('id, storage_path, position, mime_type, size_bytes, checksum, caption')
      .eq('invoice_id', params.id)
      .eq('user_id', user.id)
      .order('position');
    if (rowsError) {
      console.error('estimate duplicate: attachment read failed', rowsError);
      await rollback();
      return refuse(500, 'duplicate_failed');
    }

    // Same deliverable rule as the public page: checksum + own folder only.
    const source = deliverableAttachments((rows ?? []) as AttachmentRow[], user.id, params.id)
      .filter((row) => row.mime_type && (ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(row.mime_type));

    for (const row of source) {
      const path = `${user.id}/${newId}/${crypto.randomUUID()}.${EXT[row.mime_type as string]}`;
      const { error: copyError } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .copy(row.storage_path, path);
      if (copyError) {
        console.error('estimate duplicate: object copy failed', copyError.message);
        await rollback();
        return refuse(500, 'duplicate_failed');
      }
      copiedPaths.push(path);

      const { data: added, error: addError } = await admin.rpc('add_estimate_attachment', {
        p_invoice_id: newId,
        p_user_id: user.id,
        p_path: path,
        p_mime: row.mime_type,
        p_size: row.size_bytes,
        p_checksum: row.checksum,
      });
      const result = added as { ok?: boolean; id?: string; code?: string } | null;
      if (addError || !result?.ok || !result.id) {
        console.error('estimate duplicate: attachment row failed', addError?.code ?? result?.code ?? 'unknown');
        await rollback();
        return refuse(500, 'duplicate_failed');
      }

      const caption = (row.caption ?? '').trim();
      if (caption) {
        const { error: captionError } = await admin.rpc('set_estimate_attachment_caption', {
          p_invoice_id: newId,
          p_user_id: user.id,
          p_attachment_id: result.id,
          p_caption: caption,
        });
        if (captionError) {
          console.error('estimate duplicate: caption failed', captionError.code ?? captionError.message);
          await rollback();
          return refuse(500, 'duplicate_failed');
        }
      }
    }

    return NextResponse.json({
      estimate: { id: newId, invoice_number: created.invoice_number },
    });
  } catch (e) {
    console.error('estimate duplicate: failed', e);
    return refuse(500, 'duplicate_failed');
  }
}

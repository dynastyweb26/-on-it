// POST /api/estimates/[id]/attachments/confirm — verify the stored object, then
// commit its metadata row.
//
// The client's Content-Type is never trusted. The object is downloaded with the
// service role, its magic bytes are checked (JPG / PNG / PDF), its real size is
// read, and its sha256 is computed. Only then does add_estimate_attachment
// count/size/position-check under a row lock and insert. A failed commit removes
// the orphan object (except a duplicate, whose object is already committed).
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { ATTACHMENT_BUCKET } from '@/lib/estimates/limits';
import { validateAttachmentBytes } from '@/lib/estimates/file-type';
import { ConfirmBodySchema } from '@/lib/estimates/schemas';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');
  if (!(await rateLimit('estimate_upload', rateIdentifier(req, user.id)))) {
    return refuse(429, 'rate_limited');
  }

  const body = ConfirmBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'validation');

  const path = body.data.path;
  const prefix = `${user.id}/${params.id}/`;
  if (!path.startsWith(prefix) || path.length <= prefix.length) {
    return refuse(400, 'bad_path');
  }

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (await isLocked(quote)) return refuse(409, 'locked');

    const admin = adminClient();
    const { data: blob, error: downloadError } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .download(path);
    if (downloadError || !blob) {
      console.error('estimate attachment confirm: download failed', downloadError?.message ?? 'no blob');
      return refuse(404, 'not_found');
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    const valid = validateAttachmentBytes(bytes);
    if (!valid.ok) {
      await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
      return refuse(400, valid.code);
    }

    const checksum = createHash('sha256').update(bytes).digest('hex');
    const { data, error } = await admin.rpc('add_estimate_attachment', {
      p_invoice_id: params.id,
      p_user_id: user.id,
      p_path: path,
      p_mime: valid.mime,
      p_size: valid.sizeBytes,
      p_checksum: checksum,
    });
    if (error) {
      console.error('estimate attachment confirm: rpc failed', error.code ?? error.message);
      await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
      return refuse(500, 'confirm_failed');
    }

    const result = data as
      | { ok: true; id: string; position: number }
      | { ok: false; code: string }
      | null;
    if (!result) {
      await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
      return refuse(500, 'confirm_failed');
    }
    if (!result.ok) {
      if (result.code !== 'duplicate') {
        await admin.storage.from(ATTACHMENT_BUCKET).remove([path]);
      }
      switch (result.code) {
        case 'locked':
        case 'too_many':
        case 'total_too_large':
        case 'duplicate':
          return refuse(409, result.code);
        case 'unavailable':
          return refuse(404, 'not_found');
        default:
          return refuse(400, result.code);
      }
    }

    return NextResponse.json({
      ok: true,
      attachment: {
        id: result.id,
        position: result.position,
        mimeType: valid.mime,
        sizeBytes: valid.sizeBytes,
      },
    });
  } catch (e) {
    console.error('estimate attachment confirm: failed', e);
    return refuse(500, 'confirm_failed');
  }
}

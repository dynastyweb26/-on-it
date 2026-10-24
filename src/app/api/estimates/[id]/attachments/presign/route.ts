// POST /api/estimates/[id]/attachments/presign — mint a one-object upload URL.
// The declared type/size are validated here; the bytes are verified for real in
// the confirm route before any row is written.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { ATTACHMENT_BUCKET } from '@/lib/estimates/limits';
import { validateDeclaredAttachment } from '@/lib/estimates/file-type';
import { PresignBodySchema } from '@/lib/estimates/schemas';
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

  const body = PresignBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'validation');

  const declared = validateDeclaredAttachment(body.data.mime_type, body.data.size_bytes);
  if (!declared.ok) {
    return refuse(declared.code === 'too_large' ? 413 : 400, declared.code);
  }

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (await isLocked(quote)) return refuse(409, 'locked');

    const path = `${user.id}/${params.id}/${crypto.randomUUID()}.${declared.ext}`;
    const { data, error } = await adminClient()
      .storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      console.error('estimate attachment presign: failed', error?.message ?? 'no data');
      return refuse(500, 'presign_failed');
    }

    return NextResponse.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      mimeType: declared.mime,
    });
  } catch (e) {
    console.error('estimate attachment presign: failed', e);
    return refuse(500, 'presign_failed');
  }
}

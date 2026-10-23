// PATCH /api/estimates/[id]/attachments/[attachmentId]/caption — set or clear
// one attachment's caption (max 60).
//
// The only writer is set_estimate_attachment_caption, which locks the estimate
// row and refuses an approved or converted one — the same lock as
// add_estimate_attachment. Clients hold no UPDATE privilege on
// invoice_attachments and the guard trigger refuses a client-set caption, so a
// direct REST call cannot reach this column.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { CaptionBodySchema } from '@/lib/estimates/schemas';
import { isLocked, isUuid, loadOwnedQuote } from '@/lib/estimates/owner';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; attachmentId: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id) || !isUuid(params.attachmentId)) {
    return refuse(404, 'not_found');
  }
  if (!(await rateLimit('estimate_edit', rateIdentifier(req, user.id)))) {
    return refuse(429, 'rate_limited');
  }

  const body = CaptionBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'validation');

  try {
    const quote = await loadOwnedQuote(params.id, user.id);
    if (!quote) return refuse(404, 'not_found');
    if (await isLocked(quote)) return refuse(409, 'locked');

    const { data, error } = await adminClient().rpc('set_estimate_attachment_caption', {
      p_invoice_id: params.id,
      p_user_id: user.id,
      p_attachment_id: params.attachmentId,
      p_caption: body.data.caption,
    });
    if (error) {
      console.error('estimate caption: rpc failed', error.code ?? error.message);
      return refuse(500, 'caption_failed');
    }

    const result = data as
      | { ok: true; id: string; caption: string | null }
      | { ok: false; code: string }
      | null;
    if (!result) return refuse(500, 'caption_failed');
    if (!result.ok) {
      switch (result.code) {
        case 'locked':
          return refuse(409, 'locked');
        case 'unavailable':
        case 'not_found':
          return refuse(404, 'not_found');
        default:
          return refuse(400, result.code);
      }
    }

    return NextResponse.json({
      ok: true,
      attachment: { id: result.id, caption: result.caption ?? null },
    });
  } catch (e) {
    console.error('estimate caption: failed', e);
    return refuse(500, 'caption_failed');
  }
}

// POST /api/estimates/[id]/send — the one server-side write for sending an
// estimate. Same contract as the invoice send route, plus:
//   • only kind='quote'
//   • approved or converted estimates are refused
//   • valid_until may be chosen; a missing one is set to local today + 30
//     on ANY send, while a legacy row never sent stays NULL (never expires)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { planEstimateSend, type EstimateSendableInvoice } from '@/lib/estimates/send';
import { SendBodySchema } from '@/lib/estimates/schemas';
import { hasConverted, isUuid } from '@/lib/estimates/owner';
import { readProfileTerms } from '@/lib/terms';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const SNAPSHOT_COLS =
  'invoice_template, brand_colors, background_color, business_name, logo_url, website_url, slogan, cashapp_tag, paypal_me, venmo_username, timezone';

const refuse = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuse(401, 'unauthorized');
  if (!isUuid(params.id)) return refuse(404, 'not_found');
  if (!(await rateLimit('estimate_send', rateIdentifier(req, user.id)))) {
    return refuse(429, 'rate_limited');
  }

  const body = SendBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'invalid_date');
  const requestedValidUntil = body.data?.valid_until ?? null;

  const admin = adminClient();
  const id = params.id;

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select(SNAPSHOT_COLS)
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('estimate send: profile read failed', profileError);
    return refuse(500, 'send_failed');
  }

  const terms = await readProfileTerms(admin, user.id);
  const sentAt = new Date().toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: invoice, error } = await admin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      console.error('estimate send: read failed', error);
      return refuse(500, 'send_failed');
    }

    let converted = false;
    try {
      converted = invoice ? await hasConverted(id) : false;
    } catch (e) {
      console.error('estimate send: converted lookup failed', e);
      return refuse(500, 'send_failed');
    }

    const plan = planEstimateSend(
      invoice as EstimateSendableInvoice | null,
      user.id,
      { ...(profile ?? {}), terms },
      new Date(sentAt),
      { converted, requestedValidUntil },
    );
    if (!plan.ok) {
      switch (plan.code) {
        case 'invalid_date':
        case 'past_date':
          return refuse(400, plan.code);
        case 'approved':
        case 'converted':
          return refuse(409, plan.code);
        case 'not_estimate':
          return refuse(409, 'not_estimate');
        case 'void':
          return refuse(409, 'void');
        default:
          // Not found, not yours, or deleted: one answer, no existence leak.
          return refuse(404, 'not_found');
      }
    }

    let update = admin
      .from('invoices')
      .update(plan.patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null);
    update = plan.firstSend
      ? update.or('status.eq.draft,status.is.null')
      : update.neq('status', 'void');

    const { data: updated, error: updateError } = await update.select('*').maybeSingle();
    if (updateError) {
      console.error('estimate send: update failed', updateError);
      return refuse(500, 'send_failed');
    }
    if (updated) {
      return NextResponse.json({ estimate: updated, firstSend: plan.firstSend });
    }
  }

  return refuse(409, 'send_conflict');
}

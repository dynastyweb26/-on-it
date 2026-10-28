// POST /api/invoices/[id]/send — the one server-side write for "mark sent".
//
// The client shares the PDF first, then calls this route. Auth is the session
// user; ownership and deleted_at are re-checked here with the service-role
// client, never trusted from the client. A draft becomes sent and captures the
// render snapshot. A resend only bumps sent_at, so a paid or overdue invoice
// can never regress. Void and deleted rows are refused.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { planInvoiceSend, type SendableInvoice } from '@/lib/invoice-send';
import { isUuid } from '@/lib/estimates/owner';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { readProfileTerms } from '@/lib/terms';

export const runtime = 'nodejs';

const SNAPSHOT_COLS =
  'invoice_template, brand_colors, background_color, business_name, logo_url, website_url, slogan, cashapp_tag, paypal_me, venmo_username';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
  }
  if (!(await rateLimit('invoice_send', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const admin = adminClient();
  const id = params.id;

  const load = async () => {
    const { data, error } = await admin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as (SendableInvoice & Record<string, unknown>) | null;
  };

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select(SNAPSHOT_COLS)
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('invoice send: profile read failed', profileError);
    return NextResponse.json({ error: 'send failed' }, { status: 500 });
  }

  const terms = await readProfileTerms(admin, user.id);
  const sentAt = new Date().toISOString();

  // A payment can land between the read and the update. The conditional update
  // makes the draft→sent transition atomic; if it misses, re-read and retry as
  // a resend (sent_at only), which is always safe for a paid/overdue invoice.
  for (let attempt = 0; attempt < 2; attempt++) {
    let invoice: (SendableInvoice & Record<string, unknown>) | null;
    try {
      invoice = await load();
    } catch (error) {
      console.error('invoice send: read failed', error);
      return NextResponse.json({ error: 'send failed' }, { status: 500 });
    }

    const plan = planInvoiceSend(invoice, user.id, { ...(profile ?? {}), terms }, sentAt);
    if (!plan.ok) {
      if (plan.reason === 'void') {
        return NextResponse.json({ error: 'invoice is void' }, { status: 409 });
      }
      // Not found, not yours, or deleted: one answer, no existence leak.
      return NextResponse.json({ error: 'invoice not found' }, { status: 404 });
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

    const { data: updated, error } = await update.select('*').maybeSingle();
    if (error) {
      console.error('invoice send: update failed', error);
      return NextResponse.json({ error: 'send failed' }, { status: 500 });
    }
    if (updated) {
      return NextResponse.json({ invoice: updated, firstSend: plan.firstSend });
    }
  }

  return NextResponse.json({ error: 'send conflict' }, { status: 409 });
}

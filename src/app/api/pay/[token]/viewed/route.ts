// POST /api/pay/[token]/viewed — "{client} opened INV-xxxx".
//
// Fired by the public pay page (PayView) from its own code once the page has
// been visible for a few continuous seconds — never on GET, so link-preview
// fetchers (including the iMessage preview built on the SENDER's phone) and
// JS-running email scanners don't count as views.
//
// Public and unauthenticated (the bearer token is the authorization, as for
// the page itself), so IP rate-limited. The body is empty; the only inputs
// are the token in the URL and, if someone is signed in, their user id from
// the session — never from the request. mark_invoice_viewed (service role,
// 20260930000003) stamps viewed_at on the FIRST qualifying view only: a sent
// or overdue invoice (not a quote), 2+ minutes after it was sent, not viewed
// by its owner. It returns the owner's id to this route only; the response
// carries nothing about the invoice, so a token can't be probed with it.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { notify } from '@/lib/notify';
import { hourBucket } from '@/lib/events';
import { insertEvent, logDocumentView, viewerHash } from '@/lib/events-server';

export const runtime = 'nodejs';

// Same shape check as the pay page: base64url, ≤ 32 chars.
const TOKEN_RE = /^[A-Za-z0-9_-]{1,32}$/;
// No meaningful body — validate anyway (security pattern).
const ViewedBody = z.object({}).nullish();

// Same answer whatever happened, so the endpoint reveals nothing.
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!TOKEN_RE.test(token)) return ok();
  if (!(await rateLimit('pay_viewed', `ip:${clientIp(req)}`))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  if (!ViewedBody.safeParse(await req.json().catch(() => null)).success) return ok();

  // The owner opening their own link must not count. Signed-out is normal.
  let viewer: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    viewer = user?.id ?? null;
  } catch { /* no session */ }

  const { data, error } = await adminClient().rpc('mark_invoice_viewed', {
    p_token: token,
    p_viewer: viewer,
  });
  if (error) {
    console.error('mark_invoice_viewed failed', error.code ?? error.message);
    return ok();
  }
  // The durable view log (alive layer): recorded on EVERY qualifying view, so
  // a card can say "3rd time today". mark_invoice_viewed above still owns
  // invoices.viewed_at and stays first-view-only.
  const hash = viewerHash(clientIp(req), req.headers.get('user-agent') ?? '');
  await logDocumentView(token, viewer, hash);

  const row = (data as Array<{ invoice_id: string; user_id: string; invoice_number: number; client_name: string }> | null)?.[0];
  if (row) {
    // The card in the thread. One per invoice per hour — the amount is
    // deliberately left off a view.
    await insertEvent({
      userId: row.user_id,
      kind: 'invoice_viewed',
      actor: 'client',
      invoiceId: row.invoice_id,
      documentKind: 'invoice',
      documentNumber: row.invoice_number ?? null,
      clientName: row.client_name ?? null,
      dedupeKey: `invoice_viewed:${row.invoice_id}:${hourBucket(new Date())}`,
      meta: {},
    });
    // Dedupe viewed:<invoice_id> — one push per invoice, ever, even if
    // viewed_at is later cleared. notify() never throws.
    await notify(row.user_id, {
      type: 'invoice_viewed',
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      clientName: row.client_name || 'Your client',
    });
  }
  return ok();
}

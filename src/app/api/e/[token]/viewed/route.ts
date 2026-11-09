// POST /api/e/[token]/viewed — "{client} opened E-0049".
//
// The estimate twin of the pay-page ping: fired by the public estimate page
// once it has been visible for a few continuous seconds, never on GET, so a
// messenger's link preview (unfurled server-side, on the SENDER's behalf) is
// not a view. The page is public; the token is the authorization. IP limited.
//
// Two writes, both service-role and both no-ops unless the document qualifies:
//   * log_document_view — the durable view log (the "seen" card's history)
//   * one events row     — the card itself, deduped to one per hour
// An estimate that never went out, or is already signed/declined, writes
// nothing: those are the RPC's rules and the route does not second-guess them.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { hourBucket, shouldPostEstimateViewed } from '@/lib/events';
import { insertEvent, logDocumentView, viewerHash } from '@/lib/events-server';

export const runtime = 'nodejs';

const TOKEN_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ViewedBody = z.object({}).nullish();

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!TOKEN_RE.test(token)) return ok();
  if (!(await rateLimit('estimate_view', `ip:${clientIp(req)}`))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  if (!ViewedBody.safeParse(await req.json().catch(() => null)).success) return ok();

  // The owner opening their own link is not a client view. Signed-out is fine.
  let viewer: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    viewer = user?.id ?? null;
  } catch { /* no session */ }

  const hash = viewerHash(clientIp(req), req.headers.get('user-agent') ?? '');
  await logDocumentView(token, viewer, hash);

  // Read back only what a card needs, and only for a real sent estimate.
  const { data } = await adminClient()
    .from('invoices')
    .select('id, user_id, kind, status, invoice_number, client_name, total, amount_paid, approved_at, sent_at')
    .eq('public_token', token)
    .is('deleted_at', null)
    .maybeSingle();
  const row = data as {
    id: string; user_id: string; kind: string; status: string;
    invoice_number: number | null; client_name: string | null;
    total: number | null; amount_paid: number | null;
    approved_at: string | null; sent_at: string | null;
  } | null;
  if (!row || row.kind !== 'quote' || row.status === 'draft' || row.user_id === viewer) return ok();
  // A signed estimate has its own card, and a view in the first two minutes is
  // not the client reading it. The view itself is still logged above.
  if (!shouldPostEstimateViewed({ approvedAt: row.approved_at, sentAt: row.sent_at }, new Date())) return ok();

  await insertEvent({
    userId: row.user_id,
    kind: 'estimate_viewed',
    actor: 'client',
    invoiceId: row.id,
    documentKind: 'quote',
    documentNumber: row.invoice_number ?? null,
    clientName: row.client_name ?? null,
    amount: null, // a view isn't about money
    dedupeKey: `estimate_viewed:${row.id}:${hourBucket(new Date())}`,
    meta: {},
  });
  return ok();
}

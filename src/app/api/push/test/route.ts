// GET  /api/push/test — is the test sender available here? { enabled }
// POST /api/push/test — send a TEST notification to the caller's own devices.
//
// Preview-only by two independent gates: never in production (VERCEL_ENV), and
// only where PUSH_TEST_ENABLED=1 (set in Preview only). Anywhere else both
// methods 404, as if the route didn't exist.
//
// Why it exists: the preview can't take a real card payment any more (the
// user's profile holds a LIVE Stripe account id; preview runs sandbox keys),
// and preview shares the production DB. So this writes NOTHING to invoices or
// the ledger — it builds the same structured event a real payment would, from
// one of the caller's own sent invoices, and runs it through the same renderer
// and web-push channel (lib/notify). Session-gated: you can only notify
// yourself, and only this environment's devices.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { deployEnv } from '@/lib/deploy-env';
import { roundCurrency } from '@/lib/financials';
import { notifyTest } from '@/lib/notify';

const Body = z.discriminatedUnion('type', [
  z.object({ type: z.literal('payment'), variant: z.enum(['full', 'partial']) }),
  z.object({
    type: z.literal('connect_problem'),
    problem: z.enum(['charges_paused', 'details_needed', 'payouts_paused', 'disconnected']),
  }),
  z.object({ type: z.literal('viewed') }),
  z.object({ type: z.literal('draft') }),
]);

const enabled = () => deployEnv() !== 'production' && process.env.PUSH_TEST_ENABLED === '1';
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

export async function GET() {
  if (!enabled()) return notFound();
  return NextResponse.json({ enabled: true });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('push_test', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const body = parsed.data;

  if (body.type === 'connect_problem') {
    const delivered = await notifyTest(user.id, {
      type: 'connect_problem', problem: body.problem, sourceEventId: 'test',
    });
    return NextResponse.json({ delivered });
  }

  if (body.type === 'draft') {
    // The caller's most recent invoice draft (RLS: own rows only). Read-only.
    const { data: d } = await supabase
      .from('invoices')
      .select('id, invoice_number, client_name, total')
      .eq('user_id', user.id)
      .eq('kind', 'invoice')
      .eq('status', 'draft')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!d) return NextResponse.json({ error: 'no draft invoice to test with' }, { status: 404 });
    const delivered = await notifyTest(user.id, {
      type: 'draft_unsent',
      invoiceId: d.id as string,
      invoiceNumber: d.invoice_number as number,
      clientName: (d.client_name as string) || 'Your client',
      total: Number(d.total ?? 0),
    });
    return NextResponse.json({ delivered, invoiceNumber: d.invoice_number });
  }

  // The caller's most recent sent invoice (RLS: own rows only). Read-only.
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, total, amount_paid')
    .eq('user_id', user.id)
    .eq('kind', 'invoice')
    .in('status', ['sent', 'overdue', 'paid'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: 'no sent invoice to test with' }, { status: 404 });

  if (body.type === 'viewed') {
    const delivered = await notifyTest(user.id, {
      type: 'invoice_viewed',
      invoiceId: inv.id as string,
      invoiceNumber: inv.invoice_number as number,
      clientName: (inv.client_name as string) || 'Your client',
    });
    return NextResponse.json({ delivered, invoiceNumber: inv.invoice_number });
  }

  const total = Number(inv.total ?? 0);
  const owed = Math.max(0, roundCurrency(total - Number(inv.amount_paid ?? 0))) || total;
  // Full: pretend the whole balance was paid. Partial: about half of it.
  const amount = body.variant === 'full' ? owed : Math.max(0.5, roundCurrency(owed / 2));
  const balanceRemaining = body.variant === 'full' ? 0 : roundCurrency(owed - amount);

  const delivered = await notifyTest(user.id, {
    type: 'payment_received',
    paymentId: 'test',
    invoiceId: inv.id as string,
    invoiceNumber: inv.invoice_number as number,
    clientName: (inv.client_name as string) || 'Your client',
    amount,
    method: 'card',
    balanceRemaining,
    paidInFull: body.variant === 'full',
  });
  return NextResponse.json({ delivered, invoiceNumber: inv.invoice_number });
}

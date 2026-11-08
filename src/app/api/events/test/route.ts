// POST /api/events/test — one fake event for the signed-in owner, so the card
// can be seen on a preview deploy without touching the shared test data.
//
// Guarded twice (locked decision: no seeded rows in the shared database, and
// never in production for a normal account):
//   * local development          — always allowed
//   * a Vercel preview deployment — only for an address listed in the
//     EVENTS_TEST_EMAILS env var (comma-separated), so a stranger who signs up
//     on a preview URL cannot post cards into their own thread
//   * production                  — 404, even for the owner
//
// The event is a real row with meta.test = true, so it behaves exactly like a
// client event (card, realtime, seen marking). Its dedupe key is minted from
// the current second, so tapping the button twice in one minute gives two
// cards — that is the point of a test emitter.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { insertEvent } from '@/lib/events-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function allowed(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (process.env.VERCEL_ENV !== 'preview') return false;
  const list = (process.env.EVENTS_TEST_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!allowed(user.email)) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // A plausible-looking, clearly fake client. No real document is touched, so
  // no invoice_id: the card renders from the stored copy only.
  const id = await insertEvent({
    userId: user.id,
    kind: 'payment_recorded',
    actor: 'client',
    documentKind: 'invoice',
    documentNumber: 9999,
    clientName: 'Test Client',
    amount: 25,
    meta: { test: true, method: 'Zelle' },
    dedupeKey: `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  });

  return NextResponse.json({ ok: true, id });
}

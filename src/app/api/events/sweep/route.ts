// POST /api/events/sweep — the time-based half of the feed, run on app open.
//
// There is no scheduler and there is no cron (locked decision): the sweep is
// an owner-authenticated call the app makes when it opens, so nothing runs for
// an account nobody is looking at. It reads only the caller's own documents
// through their session (RLS), decides what is owed with the pure planner in
// src/lib/events.ts, and writes rows through the service role.
//
// Safe to call as often as the client likes: every time-based event carries a
// period bucket in its dedupe key (an overdue card keys on its due date, a
// stale card on its week), so a repeated sweep writes nothing.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { asKind } from '@/lib/documents';
import { decideSweep, type SweepDoc } from '@/lib/events';
import { insertEvent } from '@/lib/events-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// One page of documents is enough to decide a sweep; the owner's book is read
// newest-first, and anything older has already been swept once.
const LIMIT = 300;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('invoices')
    .select('id, kind, status, invoice_number, client_name, total, amount_paid, due_date, valid_until, created_at, sent_at, first_sent_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error('[sweep] read failed', error.code ?? error.message);
    return NextResponse.json({ error: 'read failed' }, { status: 500 });
  }

  const docs: SweepDoc[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    kind: asKind(typeof r.kind === 'string' ? r.kind : null),
    status: String(r.status ?? ''),
    documentNumber: typeof r.invoice_number === 'number' ? r.invoice_number : null,
    clientName: typeof r.client_name === 'string' ? r.client_name : '',
    total: Number(r.total ?? 0),
    amountPaid: Number(r.amount_paid ?? 0),
    dueDate: typeof r.due_date === 'string' ? r.due_date : null,
    validUntil: typeof r.valid_until === 'string' ? r.valid_until : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
    sentAt: typeof r.sent_at === 'string' ? r.sent_at
      : typeof r.first_sent_at === 'string' ? r.first_sent_at : null,
  }));

  const planned = decideSweep({ now: new Date(), docs });
  let written = 0;
  for (const e of planned) {
    const id = await insertEvent({
      userId: user.id,
      kind: e.kind,
      actor: 'time',
      invoiceId: e.invoiceId,
      documentKind: e.documentKind,
      documentNumber: e.documentNumber,
      clientName: e.clientName,
      amount: e.amount,
      meta: e.meta,
      dedupeKey: e.dedupeKey,
    });
    if (id) written += 1;
  }

  return NextResponse.json({ ok: true, planned: planned.length, written });
}

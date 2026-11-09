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
    .select('id, kind, status, invoice_number, client_name, total, amount_paid, due_date, valid_until, created_at, sent_at, first_sent_at, updated_at, approved_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error('[sweep] read failed', error.code ?? error.message);
    return NextResponse.json({ error: 'read failed' }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  // A converted estimate keeps status 'sent'; the lock lives on the new
  // invoice's converted_from, so this sweep must read it too (item 19). Batched
  // so the query string stays small.
  const quoteIds = rows
    .filter((r) => asKind(typeof r.kind === 'string' ? r.kind : null) === 'quote')
    .map((r) => String(r.id));
  const converted = new Set<string>();
  for (let i = 0; i < quoteIds.length; i += 100) {
    const { data: hits, error: convErr } = await supabase
      .from('invoices')
      .select('converted_from')
      .in('converted_from', quoteIds.slice(i, i + 100))
      .is('deleted_at', null);
    if (convErr) {
      console.error('[sweep] converted lookup failed', convErr.code ?? convErr.message);
      return NextResponse.json({ error: 'read failed' }, { status: 500 });
    }
    for (const h of hits ?? []) {
      if (h.converted_from) converted.add(String(h.converted_from));
    }
  }

  // What already posted, so the item-19 flood cap does not re-offer the same
  // three oldest cards on every open and starve the rest. RLS lets the owner
  // read their own events, so this stays on their session.
  const posted = new Set<string>();
  for (let i = 0; i < quoteIds.length; i += 100) {
    const { data: hits, error: postedErr } = await supabase
      .from('events')
      .select('invoice_id')
      .eq('kind', 'estimate_stale')
      .in('invoice_id', quoteIds.slice(i, i + 100));
    if (postedErr) {
      console.error('[sweep] posted lookup failed', postedErr.code ?? postedErr.message);
      return NextResponse.json({ error: 'read failed' }, { status: 500 });
    }
    for (const h of hits ?? []) {
      if (h.invoice_id) posted.add(String(h.invoice_id));
    }
  }

  const docs: SweepDoc[] = rows.map((r) => ({
    id: String(r.id),
    ownerId: user.id,
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
    firstSentAt: typeof r.first_sent_at === 'string' ? r.first_sent_at : null,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    approvedAt: typeof r.approved_at === 'string' ? r.approved_at : null,
    deletedAt: null, // the query already excludes soft-deleted rows
    converted: converted.has(String(r.id)),
  }));

  const planned = decideSweep({ now: new Date(), docs, posted });
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

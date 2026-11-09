// ═══ The daily stale-estimate sweep (alive layer item 19) ═══
// Runs as the last step of /api/followups (Hobby: one cron entry). Finds every
// owner's sent, unsigned, unconverted estimate that has been silent for four
// days and writes ONE `estimate_stale` event per estimate, ever: the dedupe key
// carries the threshold (`estimate_stale:<id>:4d`), and
// events_user_dedupe_uidx rejects a repeat, so a later run writes nothing.
//
// Preview guard: preview and production share one database, so a preview run
// over everyone would post real cards into real threads. `sweepAllowedIn`
// (src/lib/events.ts) is the same production-only rule the draft-nudge and
// recap steps use; the caller passes its env, and the default is deployEnv().
//
// The decisions themselves live in decideSweep (src/lib/events.ts), so the
// thresholds and skips are tested without a database. This file only reads what
// the planner needs and writes what it returns.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { asKind } from '@/lib/documents';
import { deployEnv, type DeployEnv } from '@/lib/deploy-env';
import {
  DUE_SOON_DAYS, PAY_PAGE_MAX_HOURS, PAY_PAGE_WAIT_MINUTES, STALE_DAYS, STALE_MAX_DAYS,
  decideSweep, sweepAllowedIn, type SweepDoc,
} from '@/lib/events';
import { insertEvent } from '@/lib/events-server';

const DAY_MS = 24 * 3600e3;
const LIMIT = 500;
const CONVERTED_BATCH = 100;

export type StaleEstimateSweepResult =
  | { skipped: string }
  | { candidates: number; written: number };

export async function runEstimateStaleSweep(
  now: Date = new Date(),
  env: DeployEnv = deployEnv(),
): Promise<StaleEstimateSweepResult> {
  if (!sweepAllowedIn(env)) return { skipped: 'not production' };

  const admin = adminClient();
  const cutoff = new Date(now.getTime() - STALE_DAYS * DAY_MS).toISOString();
  // The other end of the window: past this the estimate is abandoned, and the
  // scan should not even read it.
  const monthAgo = new Date(now.getTime() - STALE_MAX_DAYS * DAY_MS).toISOString();

  // Signed (approved_at), converted, deleted and freshly revised rows never
  // reach the planner: the first three are refused in SQL, the revision check
  // is the updated_at bound below (the planner re-checks it as well).
  const { data, error } = await admin
    .from('invoices')
    .select('id, user_id, kind, status, invoice_number, client_name, total, amount_paid, due_date, valid_until, created_at, sent_at, first_sent_at, updated_at, approved_at')
    .eq('kind', 'quote')
    .eq('status', 'sent')
    .is('deleted_at', null)
    .is('approved_at', null)
    .gte('first_sent_at', monthAgo)
    .lt('first_sent_at', cutoff)
    .lt('updated_at', cutoff)
    .order('first_sent_at', { ascending: true })
    .limit(LIMIT);

  if (error) {
    console.error('stale estimates: scan failed', error.code ?? error.message);
    return { candidates: 0, written: 0 };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return { candidates: 0, written: 0 };

  // A converted estimate keeps status 'sent' — the conversion is recorded on
  // the NEW invoice (converted_from), so the lock has to be read, not inferred.
  // Batched to keep the query string small.
  const ids = rows.map((r) => String(r.id));
  const converted = new Set<string>();
  for (let i = 0; i < ids.length; i += CONVERTED_BATCH) {
    const { data: hits, error: convErr } = await admin
      .from('invoices')
      .select('converted_from')
      .in('converted_from', ids.slice(i, i + CONVERTED_BATCH))
      .is('deleted_at', null);
    if (convErr) {
      console.error('stale estimates: converted lookup failed', convErr.code ?? convErr.message);
      return { candidates: 0, written: 0 };
    }
    for (const h of hits ?? []) {
      if (h.converted_from) converted.add(String(h.converted_from));
    }
  }

  // What already posted: the flood cap holds cards back, so without this the
  // oldest three would win every run and the rest would never be written.
  const posted = new Set<string>();
  for (let i = 0; i < ids.length; i += CONVERTED_BATCH) {
    const { data: hits, error: postedErr } = await admin
      .from('events')
      .select('invoice_id')
      .eq('kind', 'estimate_stale')
      .in('invoice_id', ids.slice(i, i + CONVERTED_BATCH));
    if (postedErr) {
      console.error('stale estimates: posted lookup failed', postedErr.code ?? postedErr.message);
      return { candidates: 0, written: 0 };
    }
    for (const h of hits ?? []) {
      if (h.invoice_id) posted.add(String(h.invoice_id));
    }
  }

  const owner = new Map(rows.map((r) => [String(r.id), String(r.user_id)]));
  const docs: SweepDoc[] = rows.map((r) => ({
    id: String(r.id),
    ownerId: String(r.user_id),
    kind: 'quote',
    status: String(r.status ?? ''),
    documentNumber: typeof r.invoice_number === 'number' ? r.invoice_number : null,
    clientName: typeof r.client_name === 'string' ? r.client_name : '',
    total: Number(r.total ?? 0),
    amountPaid: Number(r.amount_paid ?? 0),
    dueDate: typeof r.due_date === 'string' ? r.due_date : null,
    validUntil: typeof r.valid_until === 'string' ? r.valid_until : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : now.toISOString(),
    sentAt: typeof r.sent_at === 'string' ? r.sent_at : null,
    firstSentAt: typeof r.first_sent_at === 'string' ? r.first_sent_at : null,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    approvedAt: typeof r.approved_at === 'string' ? r.approved_at : null,
    deletedAt: null, // filtered in the query above
    converted: converted.has(String(r.id)),
  }));

  // Only the card this step owns. The planner also knows an expiring-soon card,
  // which the app-open sweep already posts; this cron must not double up.
  const planned = decideSweep({ now, docs, posted }).filter((e) => e.kind === 'estimate_stale');

  let written = 0;
  for (const e of planned) {
    const userId = owner.get(e.invoiceId);
    if (!userId) continue;
    const id = await insertEvent({
      userId,
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

  return { candidates: planned.length, written };
}

// ═══ Item 23: the pay-page catch-up ═══
// The app-open sweep is what catches the twenty-minute case, while the owner is
// in the thread. This is the daily cron's catch-up for every owner who is not:
// a client who opened the pay page and never paid still gets one card, for a
// view at least twenty minutes and at most twenty-four hours old, at most one
// card per invoice per day. Sourced from document_views, which the log RPC only
// writes for a non-owner session. Production only, like the sweeps above.
export async function runPayPageSweep(
  now: Date = new Date(),
  env: DeployEnv = deployEnv(),
): Promise<DueSoonSweepResult> {
  if (!sweepAllowedIn(env)) return { skipped: 'not production' };

  const admin = adminClient();
  // The window IS the condition: a view younger than twenty minutes is too
  // fresh to be stuck, and one older than a day is no longer news.
  const oldest = new Date(now.getTime() - PAY_PAGE_MAX_HOURS * 3600e3).toISOString();
  const newest = new Date(now.getTime() - PAY_PAGE_WAIT_MINUTES * 60e3).toISOString();

  const { data: views, error: viewErr } = await admin
    .from('document_views')
    .select('invoice_id, viewed_at')
    .eq('document_kind', 'invoice')
    .gte('viewed_at', oldest)
    .lte('viewed_at', newest)
    .order('viewed_at', { ascending: false })
    .limit(LIMIT);
  if (viewErr) {
    console.error('pay page: view scan failed', viewErr.code ?? viewErr.message);
    return { candidates: 0, written: 0 };
  }

  const latestView = new Map<string, string>();
  for (const v of views ?? []) {
    const id = String(v.invoice_id);
    if (!latestView.has(id)) latestView.set(id, String(v.viewed_at));
  }
  const ids = [...latestView.keys()];
  if (!ids.length) return { candidates: 0, written: 0 };

  const cols = 'id, user_id, kind, status, invoice_number, client_name, total, amount_paid, due_date, valid_until, created_at, sent_at, first_sent_at, updated_at, approved_at';
  const rows: Array<Record<string, unknown>> = [];
  for (let i = 0; i < ids.length; i += CONVERTED_BATCH) {
    const { data, error } = await admin
      .from('invoices')
      .select(cols)
      .in('id', ids.slice(i, i + CONVERTED_BATCH))
      .in('status', ['sent', 'overdue'])
      .is('deleted_at', null);
    if (error) {
      console.error('pay page: invoice scan failed', error.code ?? error.message);
      return { candidates: 0, written: 0 };
    }
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  if (!rows.length) return { candidates: 0, written: 0 };

  // A payment after the view means the page is not stuck; the planner compares
  // the two timestamps, so only the latest positive payment matters.
  const lastPayment = new Map<string, string>();
  for (let i = 0; i < ids.length; i += CONVERTED_BATCH) {
    const { data, error } = await admin
      .from('invoice_payments')
      .select('invoice_id, paid_at')
      .in('invoice_id', ids.slice(i, i + CONVERTED_BATCH))
      .gt('amount', 0)
      .gte('paid_at', oldest)
      .order('paid_at', { ascending: false });
    if (error) {
      console.error('pay page: payment lookup failed', error.code ?? error.message);
      return { candidates: 0, written: 0 };
    }
    for (const p of data ?? []) {
      const id = String(p.invoice_id);
      if (!lastPayment.has(id)) lastPayment.set(id, String(p.paid_at));
    }
  }

  const postedKeys = new Set<string>();
  const invoiceIds = rows.map((r) => String(r.id));
  for (let i = 0; i < invoiceIds.length; i += CONVERTED_BATCH) {
    const { data, error } = await admin
      .from('events')
      .select('dedupe_key')
      .eq('kind', 'pay_page_opened_unpaid')
      .in('invoice_id', invoiceIds.slice(i, i + CONVERTED_BATCH));
    if (error) {
      console.error('pay page: posted lookup failed', error.code ?? error.message);
      return { candidates: 0, written: 0 };
    }
    for (const h of data ?? []) {
      if (h.dedupe_key) postedKeys.add(String(h.dedupe_key));
    }
  }

  const owner = new Map(rows.map((r) => [String(r.id), String(r.user_id)]));
  const docs: SweepDoc[] = rows.map((r) => ({
    id: String(r.id),
    ownerId: String(r.user_id),
    kind: asKind(typeof r.kind === 'string' ? r.kind : null),
    status: String(r.status ?? ''),
    documentNumber: typeof r.invoice_number === 'number' ? r.invoice_number : null,
    clientName: typeof r.client_name === 'string' ? r.client_name : '',
    total: Number(r.total ?? 0),
    amountPaid: Number(r.amount_paid ?? 0),
    dueDate: typeof r.due_date === 'string' ? r.due_date : null,
    validUntil: typeof r.valid_until === 'string' ? r.valid_until : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : now.toISOString(),
    sentAt: typeof r.sent_at === 'string' ? r.sent_at : null,
    firstSentAt: typeof r.first_sent_at === 'string' ? r.first_sent_at : null,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    approvedAt: typeof r.approved_at === 'string' ? r.approved_at : null,
    deletedAt: null, // filtered in the query above
    converted: false, // invoices are never converted; only quotes are
    latestViewAt: latestView.get(String(r.id)) ?? null,
    lastPaymentAt: lastPayment.get(String(r.id)) ?? null,
  }));

  const planned = decideSweep({ now, docs, postedKeys })
    .filter((e) => e.kind === 'pay_page_opened_unpaid');

  let written = 0;
  for (const e of planned) {
    const userId = owner.get(e.invoiceId);
    if (!userId) continue;
    const id = await insertEvent({
      userId,
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

  return { candidates: planned.length, written };
}

// ═══ Item 25: the near-due sweep ═══
// The app-open sweep already posts "due soon" and "expires soon", but only for
// an owner who opens the app. This is the same two cards for everyone else, as
// a step in the daily followups cron: invoices sent and unpaid with a due date
// inside the next three days, and estimates sent, unsigned and unconverted with
// a valid-until inside the same window. Same planner, same per-owner cap (three
// per kind per run, soonest first) and the same production-only guard as item
// 19: preview shares the database, so a preview run would post real cards.
export type DueSoonSweepResult =
  | { skipped: string }
  | { candidates: number; written: number };

export async function runDueSoonSweep(
  now: Date = new Date(),
  env: DeployEnv = deployEnv(),
): Promise<DueSoonSweepResult> {
  if (!sweepAllowedIn(env)) return { skipped: 'not production' };

  const admin = adminClient();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS).toISOString().slice(0, 10);
  const cols = 'id, user_id, kind, status, invoice_number, client_name, total, amount_paid, due_date, valid_until, created_at, sent_at, first_sent_at, updated_at, approved_at';

  const [dueInvoices, expiringQuotes] = await Promise.all([
    // Unpaid is the planner's call: PostgREST cannot compare two columns.
    admin.from('invoices').select(cols)
      .eq('kind', 'invoice').eq('status', 'sent')
      .is('deleted_at', null)
      .not('due_date', 'is', null).gte('due_date', today).lte('due_date', horizon)
      .limit(LIMIT),
    admin.from('invoices').select(cols)
      .eq('kind', 'quote').eq('status', 'sent')
      .is('deleted_at', null).is('approved_at', null)
      .not('valid_until', 'is', null).gte('valid_until', today).lte('valid_until', horizon)
      .limit(LIMIT),
  ]);

  if (dueInvoices.error || expiringQuotes.error) {
    const e = dueInvoices.error ?? expiringQuotes.error;
    console.error('near-due documents: scan failed', e?.code ?? e?.message);
    return { candidates: 0, written: 0 };
  }

  const rows = [...(dueInvoices.data ?? []), ...(expiringQuotes.data ?? [])] as Array<Record<string, unknown>>;
  if (!rows.length) return { candidates: 0, written: 0 };

  // A converted estimate keeps status 'sent', so the lock has to be read from
  // the new invoice's converted_from (the planner still skips it, this bounds
  // what it is asked about).
  const quoteIds = rows.filter((r) => r.kind === 'quote').map((r) => String(r.id));
  const converted = new Set<string>();
  for (let i = 0; i < quoteIds.length; i += CONVERTED_BATCH) {
    const { data: hits, error: convErr } = await admin
      .from('invoices')
      .select('converted_from')
      .in('converted_from', quoteIds.slice(i, i + CONVERTED_BATCH))
      .is('deleted_at', null);
    if (convErr) {
      console.error('near-due documents: converted lookup failed', convErr.code ?? convErr.message);
      return { candidates: 0, written: 0 };
    }
    for (const h of hits ?? []) {
      if (h.converted_from) converted.add(String(h.converted_from));
    }
  }

  // Cards already posted do not take one of this run's three slots, so the ones
  // the cap holds back still get their turn on a later run.
  const ids = rows.map((r) => String(r.id));
  const postedKeys = new Set<string>();
  for (let i = 0; i < ids.length; i += CONVERTED_BATCH) {
    const { data: hits, error: postedErr } = await admin
      .from('events')
      .select('dedupe_key')
      .in('kind', ['invoice_due_soon', 'estimate_expiring_soon'])
      .in('invoice_id', ids.slice(i, i + CONVERTED_BATCH));
    if (postedErr) {
      console.error('near-due documents: posted lookup failed', postedErr.code ?? postedErr.message);
      return { candidates: 0, written: 0 };
    }
    for (const h of hits ?? []) {
      if (h.dedupe_key) postedKeys.add(String(h.dedupe_key));
    }
  }

  const owner = new Map(rows.map((r) => [String(r.id), String(r.user_id)]));
  const docs: SweepDoc[] = rows.map((r) => ({
    id: String(r.id),
    ownerId: String(r.user_id),
    kind: asKind(typeof r.kind === 'string' ? r.kind : null),
    status: String(r.status ?? ''),
    documentNumber: typeof r.invoice_number === 'number' ? r.invoice_number : null,
    clientName: typeof r.client_name === 'string' ? r.client_name : '',
    total: Number(r.total ?? 0),
    amountPaid: Number(r.amount_paid ?? 0),
    dueDate: typeof r.due_date === 'string' ? r.due_date : null,
    validUntil: typeof r.valid_until === 'string' ? r.valid_until : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : now.toISOString(),
    sentAt: typeof r.sent_at === 'string' ? r.sent_at : null,
    firstSentAt: typeof r.first_sent_at === 'string' ? r.first_sent_at : null,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    approvedAt: typeof r.approved_at === 'string' ? r.approved_at : null,
    deletedAt: null, // filtered in the queries above
    converted: converted.has(String(r.id)),
  }));

  // Only the two cards this step owns; the planner still knows the rest.
  const planned = decideSweep({ now, docs, postedKeys })
    .filter((e) => e.kind === 'invoice_due_soon' || e.kind === 'estimate_expiring_soon');

  let written = 0;
  for (const e of planned) {
    const userId = owner.get(e.invoiceId);
    if (!userId) continue;
    const id = await insertEvent({
      userId,
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

  return { candidates: planned.length, written };
}

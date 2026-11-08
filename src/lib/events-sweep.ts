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
import { deployEnv, type DeployEnv } from '@/lib/deploy-env';
import { STALE_DAYS, decideSweep, sweepAllowedIn, type SweepDoc } from '@/lib/events';
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

  const owner = new Map(rows.map((r) => [String(r.id), String(r.user_id)]));
  const docs: SweepDoc[] = rows.map((r) => ({
    id: String(r.id),
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
  const planned = decideSweep({ now, docs }).filter((e) => e.kind === 'estimate_stale');

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

// Draft nudges: "Ben's $250 invoice is still a draft — tap to send."
//
// Runs as the second step of the daily /api/followups cron (Hobby plan: no
// extra cron entry). One run, per owner, sends at most ONE nudge — for their
// newest eligible draft. A draft is eligible when it is:
//   • an invoice (kind = 'invoice'; quotes are never nudged), status 'draft',
//     not soft-deleted, never sent (first_sent_at null) — the predicate of
//     invoices_unsent_drafts_idx (20260930000004), repeated here in full;
//   • last updated between 14 days and 24 hours ago: a draft still being
//     edited isn't nudged yet, and an old or duplicate draft never is;
//   • not nudged before (dedupe draft:<invoice_id>, one nudge per draft ever).
// The owner must have notify_draft_nudges on, a valid timezone that is not in
// quiet hours (21:00–08:00 local; a null/unknown zone means no nudge), no
// draft nudge in the last 20 hours, and a push device in THIS environment (so
// a nudge is never "claimed" by an owner nobody can reach).
//
// The draft's status is re-read just before sending, so one sent or paid
// since the scan is skipped.
//
// Environment guard: notification_log dedupe keys are shared by preview and
// production (one database), so a preview run over everyone would claim real
// drafts and deliver only to preview devices. Callers therefore run it for all
// owners only in production, and in preview test mode only for the signed-in
// user (onlyUserId).
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { deployEnv } from '@/lib/deploy-env';
import { notify } from '@/lib/notify';

const DAY_MS = 24 * 3600e3;
const MIN_AGE_MS = DAY_MS;          // untouched for at least 24h
const MAX_AGE_MS = 14 * DAY_MS;     // but touched within the last 14 days
const USER_CAP_MS = 20 * 3600e3;    // one draft nudge per owner per 20h
const QUIET_START = 21;             // local hour, inclusive
const QUIET_END = 8;                // local hour, exclusive

/** The owner's local hour (0–23), or null for a null/unknown timezone. */
export function localHour(timeZone: string | null | undefined, at: Date): number | null {
  if (!timeZone) return null;
  try {
    const h = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at);
    const n = Number(h);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  } catch {
    return null; // RangeError: not a zone this runtime knows
  }
}

type Draft = { id: string; user_id: string; invoice_number: number; client_name: string | null; total: number | null };

export async function runDraftNudges(opts: { onlyUserId?: string } = {}): Promise<{ candidates: number; sent: number }> {
  const admin = adminClient();
  const now = new Date();

  let q = admin
    .from('invoices')
    .select('id, user_id, invoice_number, client_name, total')
    .eq('status', 'draft')
    .eq('kind', 'invoice')
    .is('deleted_at', null)
    .is('first_sent_at', null)
    .gte('updated_at', new Date(now.getTime() - MAX_AGE_MS).toISOString())
    .lt('updated_at', new Date(now.getTime() - MIN_AGE_MS).toISOString())
    .order('updated_at', { ascending: false })
    .limit(500);
  if (opts.onlyUserId) q = q.eq('user_id', opts.onlyUserId);
  const { data: rows, error } = await q;
  if (error) {
    console.error('draft nudges: scan failed', error.code ?? error.message);
    return { candidates: 0, sent: 0 };
  }
  const drafts = (rows ?? []) as Draft[];
  if (!drafts.length) return { candidates: 0, sent: 0 };

  // Drop drafts already nudged (dedupe keys are claimed forever).
  const { data: done } = await admin
    .from('notification_log')
    .select('dedupe_key')
    .in('dedupe_key', drafts.map((d) => `draft:${d.id}`));
  const nudged = new Set((done ?? []).map((r) => r.dedupe_key as string));

  // Newest-first candidates per owner (the scan is ordered updated_at desc).
  const byUser = new Map<string, Draft[]>();
  for (const d of drafts) {
    if (nudged.has(`draft:${d.id}`)) continue;
    const list = byUser.get(d.user_id) ?? [];
    list.push(d);
    byUser.set(d.user_id, list);
  }
  const userIds = [...byUser.keys()];
  if (!userIds.length) return { candidates: 0, sent: 0 };

  // Owner gates: opted in, local time outside quiet hours, a device here, and
  // no draft nudge in the last 20h.
  const [{ data: profiles }, { data: devices }, { data: recent }] = await Promise.all([
    admin.from('profiles').select('id, timezone, notify_draft_nudges').in('id', userIds),
    admin.from('push_subscriptions').select('user_id').in('user_id', userIds).eq('env', deployEnv()),
    admin.from('notification_log').select('user_id')
      .eq('event_type', 'draft_unsent')
      .in('user_id', userIds)
      .gte('created_at', new Date(now.getTime() - USER_CAP_MS).toISOString()),
  ]);
  const reachable = new Set((devices ?? []).map((r) => r.user_id as string));
  const capped = new Set((recent ?? []).map((r) => r.user_id as string));

  let candidates = 0;
  let sent = 0;
  for (const prof of profiles ?? []) {
    const uid = prof.id as string;
    if (prof.notify_draft_nudges === false || !reachable.has(uid) || capped.has(uid)) continue;
    const hour = localHour(prof.timezone as string | null, now);
    if (hour === null || hour >= QUIET_START || hour < QUIET_END) continue;

    for (const d of byUser.get(uid) ?? []) {
      candidates++;
      // Re-check right before sending: sent, paid (000002) or deleted since the scan?
      const { data: fresh } = await admin
        .from('invoices')
        .select('status, kind, first_sent_at, deleted_at')
        .eq('id', d.id)
        .maybeSingle();
      if (!fresh || fresh.status !== 'draft' || fresh.kind !== 'invoice'
        || fresh.first_sent_at !== null || fresh.deleted_at !== null) continue;

      sent += await notify(uid, {
        type: 'draft_unsent',
        invoiceId: d.id,
        invoiceNumber: d.invoice_number,
        clientName: d.client_name || 'Your client',
        total: Number(d.total ?? 0),
      });
      break; // one nudge per owner per run
    }
  }
  return { candidates, sent };
}

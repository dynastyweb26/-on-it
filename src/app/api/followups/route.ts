// GET /api/followups — Vercel Cron target (see vercel.json).
// Every run: find sent/unpaid invoices not nudged in 2+ days and not due in
// the future, push a notification to the owner, stamp last_nudge_at. Then, in
// production only, send draft nudges (step 2) and build weekly/monthly recaps
// (step 3).
// Delivery goes through the shared web-push channel (lib/notify/webpush):
// parallel sends under a 4s cap, only this environment's devices, and a
// device is dropped only on 404/410 — not on any error, as before.
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { money, roundCurrency } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import { verifyCronAuth } from '@/lib/cron-auth';
import { sendWebPush } from '@/lib/notify/webpush';
import { runDraftNudges } from '@/lib/notify/draft-nudges';
import { runRecaps } from '@/lib/notify/recaps';
import { deployEnv } from '@/lib/deploy-env';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  const cutoff = new Date(Date.now() - 2 * 24 * 3600e3).toISOString();
  // Due-date gate, in each OWNER's local date (profiles.timezone, saved by the
  // app; UTC when unknown). The query below only pre-filters with one day of
  // slack (a local date can be at most one day ahead of UTC); each row is then
  // checked against its owner's own "today".
  const now = new Date();
  const utcToday = now.toISOString().slice(0, 10);
  const slackDay = new Date(now.getTime() + 24 * 3600e3).toISOString().slice(0, 10);

  const { data: due } = await supabase
    .from('invoices')
    .select('id, user_id, client_name, total, amount_paid, invoice_number, due_date')
    .is('deleted_at', null)
    .in('status', ['sent', 'overdue'])
    .or(`last_nudge_at.is.null,last_nudge_at.lt.${cutoff}`)
    // Dun on first_sent_at, not sent_at: a resend bumps sent_at, which would
    // push an unpaid invoice back out of the 2-day window and silence the nudge.
    // first_sent_at is write-once (migration 20260918000006) and backfilled from
    // sent_at. Fall back to sent_at only for a legacy sent row where first_sent_at
    // is null (backfill skips rows with a null sent_at); if both are null the row
    // isn't dunned, matching the prior sent_at-only behavior.
    .or(`first_sent_at.lt.${cutoff},and(first_sent_at.is.null,sent_at.lt.${cutoff})`)
    // Don't nag before the due date: a deposit-paid invoice whose balance is due
    // next month isn't late yet. No due date keeps the every-2-days behavior.
    .or(`due_date.is.null,due_date.lte.${slackDay}`)
    .limit(200);

  // Each owner's local "today" (YYYY-MM-DD). en-CA formats as ISO.
  const ownerIds = [...new Set((due ?? []).map((i) => i.user_id as string))];
  const { data: zones } = ownerIds.length
    ? await supabase.from('profiles').select('id, timezone').in('id', ownerIds)
    : { data: [] as { id: string; timezone: string | null }[] };
  const localToday = new Map<string, string>();
  for (const z of zones ?? []) {
    let d = utcToday;
    if (z.timezone) {
      try {
        d = new Intl.DateTimeFormat('en-CA', { timeZone: z.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      } catch { /* unknown zone → UTC */ }
    }
    localToday.set(z.id as string, d);
  }

  let sent = 0;
  for (const inv of due ?? []) {
    // Not due yet in the owner's own date? Skip (no due date always passes).
    if (inv.due_date && inv.due_date > (localToday.get(inv.user_id) ?? utcToday)) continue;
    // Nag for what's actually still owed, not the full total: a partially-paid
    // invoice should show its remaining balance. Fully-covered rows are skipped.
    const balance = roundCurrency((inv.total ?? 0) - (inv.amount_paid ?? 0));
    if (balance <= 0) continue;

    sent += await sendWebPush(inv.user_id, {
      title: `${inv.client_name} hasn't paid yet`,
      body: `${formatDocNumber('invoice', inv.invoice_number)}: ${money(balance)} still due. Tap to view.`,
      url: `/invoices/${inv.id}`,
      tag: `reminder-${inv.id}`,
    }, { ttl: 24 * 3600, urgency: 'normal' });
    await supabase.from('invoices').update({ last_nudge_at: new Date().toISOString() }).eq('id', inv.id);
  }

  // Step 2: draft nudges (lib/notify/draft-nudges). Here rather than in its own
  // cron entry because the Vercel plan is Hobby. Production only: preview
  // shares the DB, and a preview run would claim real drafts' one-time dedupe
  // keys while delivering only to preview devices. Preview tests it for the
  // signed-in user alone via /api/push/test.
  const drafts = deployEnv() === 'production'
    ? await runDraftNudges()
    : { candidates: 0, sent: 0, skipped: 'not production' };

  // Step 3: weekly/monthly recaps (lib/notify/recaps). Production only, for the
  // same reason as drafts: recap snapshots and their push dedupe keys live in
  // the shared DB, so a preview run would claim real owners' recap pushes and
  // deliver only to preview devices.
  const recaps = deployEnv() === 'production'
    ? await runRecaps()
    : { candidates: 0, built: 0, pushed: 0, skipped_empty: 0, skipped: 'not production' };

  return NextResponse.json({ checked: due?.length ?? 0, notifications: sent, drafts, recaps });
}

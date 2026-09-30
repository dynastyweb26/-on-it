// GET /api/followups — Vercel Cron target (see vercel.json).
// Every run: find sent/unpaid invoices not nudged in 2+ days and not due in
// the future, push a notification to the owner, stamp last_nudge_at.
// Delivery goes through the shared web-push channel (lib/notify/webpush):
// parallel sends under a 4s cap, only this environment's devices, and a
// device is dropped only on 404/410 — not on any error, as before.
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { money, roundCurrency } from '@/lib/financials';
import { formatDocNumber } from '@/lib/documents';
import { verifyCronAuth } from '@/lib/cron-auth';
import { sendWebPush } from '@/lib/notify/webpush';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  const cutoff = new Date(Date.now() - 2 * 24 * 3600e3).toISOString();
  // Today's date (YYYY-MM-DD) in UTC, for the due-date gate below. There is no
  // owner timezone on profiles yet; the cron runs at 15:00 UTC, when the UTC
  // date matches every US timezone's local date.
  const today = new Date().toISOString().slice(0, 10);

  const { data: due } = await supabase
    .from('invoices')
    .select('id, user_id, client_name, total, amount_paid, invoice_number')
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
    .or(`due_date.is.null,due_date.lte.${today}`)
    .limit(200);

  let sent = 0;
  for (const inv of due ?? []) {
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
  return NextResponse.json({ checked: due?.length ?? 0, notifications: sent });
}

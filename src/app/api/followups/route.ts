// GET /api/followups — Vercel Cron target (see vercel.json).
// Every run: find sent/unpaid invoices not nudged in 2+ days,
// push a notification to the owner, stamp last_nudge_at.
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { adminClient } from '@/lib/supabase/admin';
import { money, roundCurrency } from '@/lib/financials';
import { verifyCronAuth } from '@/lib/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  webpush.setVapidDetails(
    'mailto:dynastyweb26@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const supabase = adminClient();
  const cutoff = new Date(Date.now() - 2 * 24 * 3600e3).toISOString();

  const { data: due } = await supabase
    .from('invoices')
    .select('id, user_id, client_name, total, amount_paid, invoice_number')
    .is('deleted_at', null)
    .in('status', ['sent', 'overdue'])
    .or(`last_nudge_at.is.null,last_nudge_at.lt.${cutoff}`)
    .lt('sent_at', cutoff)
    .limit(200);

  let sent = 0;
  for (const inv of due ?? []) {
    // Nag for what's actually still owed, not the full total: a partially-paid
    // invoice should show its remaining balance. Fully-covered rows are skipped.
    const balance = roundCurrency((inv.total ?? 0) - (inv.amount_paid ?? 0));
    if (balance <= 0) continue;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', inv.user_id);

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: `${inv.client_name} hasn't paid yet`,
            body: `Invoice #${inv.invoice_number}: ${money(balance)} still due. Tap to view.`,
            url: `/invoices/${inv.id}`,
          })
        );
        sent++;
      } catch {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
    await supabase.from('invoices').update({ last_nudge_at: new Date().toISOString() }).eq('id', inv.id);
  }
  return NextResponse.json({ checked: due?.length ?? 0, notifications: sent });
}

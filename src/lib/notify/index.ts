// notify(userId, event) — the one server entry point for user notifications.
//
// 1. Claim the event's dedupe key in notification_log (UNIQUE; service role
//    only). Whoever inserts the row sends; everyone else — a Stripe retry, the
//    v1 + v2 double delivery, the completed + async_payment_succeeded pair —
//    finds it taken and stops. At most one push per event.
// 2. Render per channel and deliver. Channels today: web push. APNs/FCM slot
//    in here later without touching any caller.
// 3. Record how many devices accepted it.
//
// Never throws: a notification failure must never fail (or retry) the webhook
// that recorded the payment.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { renderWebPush } from './render';
import { sendWebPush, type SendOptions } from './webpush';
import type { NotifyEvent } from './types';

export type { NotifyEvent, ConnectProblem, PaymentMethod } from './types';

const OPTIONS: Record<NotifyEvent['type'], SendOptions> = {
  payment_received: { ttl: 24 * 3600, urgency: 'high' },
  connect_problem: { ttl: 72 * 3600, urgency: 'normal' },
  // A view is only news for a few hours; a stale one arriving tomorrow isn't.
  invoice_viewed: { ttl: 6 * 3600, urgency: 'normal' },
  draft_unsent: { ttl: 12 * 3600, urgency: 'low' },
  // A recap is good for the day it's built; tomorrow it's yesterday's news.
  recap: { ttl: 24 * 3600, urgency: 'normal' },
};

/** The dedupe identity of an event. A payment is its ledger row; an account
 *  problem is the user + problem + the Stripe event that revealed it (the
 *  atomic flag flip in lib/stripe/connect.ts already guarantees one winner); a
 *  view and a draft nudge are one per invoice, ever; a recap is one per owner
 *  per period. Exhaustive: a new event
 *  type fails to compile here instead of borrowing another type's key. */
export function dedupeKey(userId: string, event: NotifyEvent): string {
  switch (event.type) {
    case 'payment_received': return `payment:${event.paymentId}`;
    case 'connect_problem': return `connect:${userId}:${event.problem}:${event.sourceEventId}`;
    case 'invoice_viewed': return `viewed:${event.invoiceId}`;
    case 'draft_unsent': return `draft:${event.invoiceId}`;
    case 'recap': return `recap:${event.kind}:${userId}:${event.periodStart}`;
  }
}

/** Returns the number of devices that accepted it (0 if deduped or none). */
export async function notify(userId: string, event: NotifyEvent): Promise<number> {
  try {
    const admin = adminClient();
    const { data: claimed, error } = await admin
      .from('notification_log')
      .upsert(
        { user_id: userId, dedupe_key: dedupeKey(userId, event), event_type: event.type },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (error) {
      console.error('notify: claim failed', event.type, error.code ?? error.message);
      return 0;
    }
    if (!claimed?.length) return 0; // already sent for this event

    const delivered = await sendWebPush(userId, renderWebPush(event), OPTIONS[event.type]);
    await admin.from('notification_log').update({ delivered }).eq('id', claimed[0].id);
    return delivered;
  } catch (e) {
    console.error('notify: failed', event.type, (e as Error)?.message);
    return 0;
  }
}

/** Test sends for the preview-only /api/push/test: the SAME renderer and
 *  channel as a real event, but no dedupe (every tap sends) and logged as
 *  event_type 'test' under a random key. Never throws. */
export async function notifyTest(userId: string, event: NotifyEvent): Promise<number> {
  try {
    const admin = adminClient();
    const { data: row } = await admin
      .from('notification_log')
      .insert({ user_id: userId, dedupe_key: `test:${crypto.randomUUID()}`, event_type: 'test' })
      .select('id')
      .single();
    const delivered = await sendWebPush(userId, renderWebPush(event), OPTIONS[event.type]);
    if (row?.id) await admin.from('notification_log').update({ delivered }).eq('id', row.id);
    return delivered;
  } catch (e) {
    console.error('notify test: failed', (e as Error)?.message);
    return 0;
  }
}

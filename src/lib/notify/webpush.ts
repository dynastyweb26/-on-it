// Web-push channel: deliver one rendered message to every device a user has
// subscribed IN THIS ENVIRONMENT (preview and production share the DB; each
// sends only to its own rows).
//
//  - All devices in parallel, under ONE overall cap (SEND_BUDGET_MS) so a slow
//    push service can never hold a Stripe webhook open. Anything still pending
//    at the cap is abandoned and logged.
//  - 404 / 410 from the push service = the subscription is gone (app removed,
//    permission revoked) → delete that row. Any other failure is logged and
//    the row is KEPT (a transient APNs/FCM error must not drop a device).
//  - A successful send stamps last_used_at.
//  - Never throws.
import 'server-only';
import webpush from 'web-push';
import { adminClient } from '@/lib/supabase/admin';
import { deployEnv } from '@/lib/deploy-env';
import type { WebPushMessage } from './render';

const SEND_BUDGET_MS = 4000;
const DEFAULT_SUBJECT = 'mailto:brandon@dynastyweb.co';

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) {
    console.error('web push: VAPID keys not configured in this environment');
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || DEFAULT_SUBJECT, pub, priv);
  configured = true;
  return true;
}

export type SendOptions = {
  /** Seconds the push service may hold an undelivered message. */
  ttl: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
};

type Outcome = 'sent' | 'gone' | 'failed';

/** Send to all of the user's devices in this environment. Returns how many
 *  accepted it. */
export async function sendWebPush(userId: string, msg: WebPushMessage, opts: SendOptions): Promise<number> {
  if (!configure()) return 0;
  const admin = adminClient();
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('env', deployEnv());
  if (error) {
    console.error('web push: subscription lookup failed', error.code ?? error.message);
    return 0;
  }
  if (!subs?.length) return 0;

  const payload = JSON.stringify(msg);
  const sendOne = async (s: { endpoint: string; p256dh: string; auth: string }): Promise<Outcome> => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: opts.ttl, urgency: opts.urgency, timeout: SEND_BUDGET_MS },
      );
      await admin.from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('endpoint', s.endpoint);
      return 'sent';
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        return 'gone';
      }
      // Host only — the endpoint path is a device credential; never log it.
      console.error('web push: send failed', JSON.stringify({ status: status ?? null, host: hostOf(s.endpoint) }));
      return 'failed';
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), SEND_BUDGET_MS); });
  const all = Promise.allSettled(subs.map(sendOne));
  const result = await Promise.race([all, cap]);
  clearTimeout(timer);
  if (result === 'timeout') {
    console.error('web push: send budget exceeded', JSON.stringify({ devices: subs.length, budgetMs: SEND_BUDGET_MS }));
    return 0;
  }
  return result.filter((r) => r.status === 'fulfilled' && r.value === 'sent').length;
}

function hostOf(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return 'invalid'; }
}

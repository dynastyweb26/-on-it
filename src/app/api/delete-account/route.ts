// POST /api/delete-account — self-service account + data deletion.
//
// Honors the deletion commitment in the privacy policy. Removes the
// authenticated user's account and everything that cascades from it, plus the
// Storage objects that do NOT cascade, and cancels any live Stripe subscription
// so a deleted account can never keep billing a card.
//
// runtime = 'nodejs': uses the service-role admin client and the Stripe SDK.
//
// Order is deliberate (auth-user delete is LAST — it's the irreversible step):
//   1. Cancel Stripe subscriptions   (abort if it fails → never orphan a live sub)
//   2. Clear Storage buckets          (abort if it fails → account still intact, retriable)
//   3. Redact this user's audit_log payloads (keep the who/what/when trail)
//   4. Delete the auth user           (cascades every owning table from profiles)
//   5. Redact again                    (catches a row a service-role writer landed in the gap)
//
// What is RETAINED, by design:
//   - audit_log rows (no FK on user_id) — kept for security/fraud investigation,
//     but with personal-data payloads redacted: the pre-delete pass scrubs the
//     account's INSERT/UPDATE history, the post-delete pass catches late writes,
//     and the DELETE-path trigger (migration 20260731000000) drops the payload
//     on the cascade below. Only user_id, event type, timestamp, and row_id
//     remain. Rows are attributed to their owner by log_audit()
//     (migration 20261019000002), so the passes can find service-role writes.
//   - The Stripe *customer* object (subscriptions are canceled, not the customer)
//     so billing/tax records survive, matching the privacy policy.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { clearAccountStorage } from '@/lib/delete-account-storage';
import { redactAuditAndDelete } from '@/lib/delete-account-audit';
import { removePlaidItemsForUser } from '@/lib/plaid/items';

export const runtime = 'nodejs';

// Server-side confirmation gate — a second lock behind the typed-"DELETE" UI, so
// nothing but an explicit, intentional request can ever fire this.
const Body = z.object({ confirm: z.literal('DELETE') });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('delete_account', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  if (!Body.safeParse(await req.json().catch(() => ({}))).success) {
    return NextResponse.json({ error: 'confirmation required' }, { status: 400 });
  }

  const admin = adminClient();

  // ── 1. Stripe: cancel any live subscription BEFORE deleting anything. A
  //    deleted account with a still-billing subscription is the worst outcome,
  //    so a cancel failure aborts the whole delete (nothing destructive done
  //    yet). We keep the customer object — billing/tax records are retained.
  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id').eq('id', user.id).maybeSingle();
  const stripe = getStripe();
  if (stripe && profile?.stripe_customer_id) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: profile.stripe_customer_id, status: 'all', limit: 100,
      });
      for (const sub of subs.data) {
        if (sub.status === 'canceled' || sub.status === 'incomplete_expired') continue;
        await stripe.subscriptions.cancel(sub.id); // immediate — the account is going away
      }
    } catch (e) {
      console.error('delete-account: stripe cancel failed', e);
      return NextResponse.json(
        { error: 'stripe_cancel_failed', message: 'We couldn’t cancel your subscription just now. Please try again in a moment.' },
        { status: 502 }
      );
    }
  }

  // ── 2. Storage: clear the non-cascading buckets. Done before the auth delete
  //    so a failure here leaves the account intact and the operation retriable.
  //    This includes nested invoice-attachment objects under
  //    `${userId}/${invoiceId}/`; see lib/delete-account-storage.
  try {
    await clearAccountStorage(admin, user.id);
  } catch (e) {
    console.error('delete-account: storage clear failed', e);
    return NextResponse.json(
      { error: 'storage_clear_failed', message: 'Something went wrong removing your files. Please try again.' },
      { status: 500 }
    );
  }

  // ── 2b. Plaid: remove every linked item at Plaid BEFORE the profile cascade
  //    drops our rows, so no access token is left live on Plaid's side. Best
  //    effort by design: a Plaid error is logged and the account delete still
  //    proceeds (the owner asked for deletion, not for a retry loop).
  try {
    await removePlaidItemsForUser(admin, user.id);
  } catch (e) {
    console.error('delete-account: plaid item removal failed',
      (e as { code?: string } | null)?.code ?? 'error');
  }

  // ── 3 + 4. Audit scrub, then the irreversible auth delete, then a second
  //    scrub. The pre-delete pass clears this account's lifetime of
  //    INSERT/UPDATE rows (client names, line items, business details) while
  //    keeping the who/what/when trail, and a failure aborts before anything
  //    irreversible. The auth delete is not instantaneous, so a service-role
  //    writer (Stripe webhook, cron) can still land a row attributed to this
  //    user between the passes; audit_log has no FK on user_id, so those rows
  //    survive the cascade. The post-delete pass catches them. It is
  //    best-effort: the account is already gone, so it cannot be rolled back.
  //    See lib/delete-account-audit.
  let delResult: { error: unknown };
  try {
    delResult = await redactAuditAndDelete(admin, user.id, async () => {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      return { error };
    });
  } catch (e) {
    console.error('delete-account: audit redaction failed', e);
    return NextResponse.json(
      { error: 'audit_redaction_failed', message: 'Something went wrong finishing your deletion. Please try again.' },
      { status: 500 }
    );
  }

  if (delResult.error) {
    console.error('delete-account: auth user delete failed', delResult.error);
    return NextResponse.json(
      { error: 'delete_failed', message: 'We couldn’t finish deleting your account. Please try again.' },
      { status: 500 }
    );
  }

  // Best-effort: drop the now-orphaned session cookie. The user row is already
  // gone, so a failure here is harmless.
  try { await supabase.auth.signOut(); } catch { /* session already invalid */ }

  return NextResponse.json({ ok: true });
}

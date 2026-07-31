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
//
// What is RETAINED, by design:
//   - audit_log rows (no FK on user_id) — kept for security/fraud investigation,
//     but with personal-data payloads redacted: step 3 scrubs the account's
//     INSERT/UPDATE history, and the DELETE-path trigger (migration
//     20260731000000) drops the payload on the cascade below. Only user_id,
//     event type, timestamp, and row_id remain.
//   - The Stripe *customer* object (subscriptions are canceled, not the customer)
//     so billing/tax records survive, matching the privacy policy.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';

export const runtime = 'nodejs';

// Server-side confirmation gate — a second lock behind the typed-"DELETE" UI, so
// nothing but an explicit, intentional request can ever fire this.
const Body = z.object({ confirm: z.literal('DELETE') });

// Every user file lives flat under `${userId}/` in one of these private/public
// buckets (owner-scoped by foldername[1] = auth.uid in RLS). None of them
// cascade from an auth-user deletion, so each must be cleared explicitly.
const BUCKETS = ['vault', 'logos', 'receipts'] as const;

/** Remove every object under `${userId}/` in one bucket. Throws on any error so
 *  the caller can abort before the irreversible auth-user delete. */
async function clearBucketFolder(admin: SupabaseClient, bucket: string, userId: string) {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100, offset });
    if (error) throw error;
    if (!data?.length) break;
    for (const f of data) paths.push(`${userId}/${f.name}`);
    if (data.length < 100) break;
  }
  if (paths.length) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
}

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
  try {
    for (const bucket of BUCKETS) await clearBucketFolder(admin, bucket, user.id);
  } catch (e) {
    console.error('delete-account: storage clear failed', e);
    return NextResponse.json(
      { error: 'storage_clear_failed', message: 'Something went wrong removing your files. Please try again.' },
      { status: 500 }
    );
  }

  // ── 3. Redact this user's personal data from the retained audit_log. The
  //    DELETE-path trigger (migration 20260731000000) drops the payload on the
  //    cascade DELETEs in step 4, but those cascade rows are written under the
  //    service role (auth.uid() is null) so they can't be found by user_id
  //    afterward — the trigger is what handles them. This scrub handles the
  //    OTHER source: the account's lifetime of INSERT/UPDATE audit rows, which
  //    carry client names, line items, and business details and are attributed
  //    to this user_id. Keep the who/what/when trail, drop the payload. Done
  //    before the irreversible delete so a failure here is retriable.
  const { error: auditErr } = await admin
    .from('audit_log')
    .update({ detail: { redacted: true } })
    .eq('user_id', user.id);
  if (auditErr) {
    console.error('delete-account: audit redaction failed', auditErr);
    return NextResponse.json(
      { error: 'audit_redaction_failed', message: 'Something went wrong finishing your deletion. Please try again.' },
      { status: 500 }
    );
  }

  // ── 4. The irreversible step. Deleting the auth user cascades profiles →
  //    clients, invoices, expenses, vault_documents, push_subscriptions (all
  //    ON DELETE CASCADE from profiles). audit_log has no FK and is retained
  //    (payloads already redacted in step 3 + by the DELETE-path trigger).
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error('delete-account: auth user delete failed', delErr);
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

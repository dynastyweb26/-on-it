// ═══ ON IT — the ONE access check ═══
// Every paywall gate calls hasAccess(userId). No scattered tier logic.
//
// - 'founder' (access_tier materialized by redeem_grant from an access_grants
//   token, e.g. 'dadcrew') bypasses everything — founders never see a paywall.
// - 'trialing' / 'active' → unlimited (a live subscription).
// - 'past_due' → unlimited (Stripe dunning grace: payment is retrying. The
//   webhook collapses the tier to 'canceled' once retries are exhausted, which
//   ends the grace — see tierFromStatus in the stripe webhook).
// - 'canceled' → paywalled.
// - 'free' (and any legacy value like the old 'standard') → free_invoice_limit()
//   real invoices, then paywalled.
//
// These tier rules MUST match the enforce_free_invoice_limit() trigger exactly
// (20260724154509) — the modal and the DB gate cannot disagree. The cap number
// itself lives in ONE place, the SQL free_invoice_limit(), read below via rpc.
//
// Server-only: it reads the DB with the session client under RLS. The client
// gates via GET /api/access, never by importing this.
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { PAYWALL_ENABLED } from '@/lib/paywall';

export type AccessTier = 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'founder';

export interface AccessResult {
  hasAccess: boolean;
  tier: AccessTier;
  invoiceCount: number; // real invoices only (quotes don't count toward the cap)
}

export async function hasAccess(userId: string): Promise<AccessResult> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('access_tier')
    .eq('id', userId)
    .maybeSingle();
  const raw = (profile?.access_tier ?? 'free') as string;

  // Count only real invoices (kind='invoice'), not quotes, toward the free cap.
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'invoice');
  const invoiceCount = count ?? 0;

  if (raw === 'founder') return { hasAccess: true, tier: 'founder', invoiceCount };
  // trialing / active / past_due → unlimited (past_due = dunning grace window).
  if (raw === 'trialing' || raw === 'active' || raw === 'past_due') {
    return { hasAccess: true, tier: raw, invoiceCount };
  }
  // Paywall kill switch: 'canceled' rejects on TIER regardless of invoice
  // count, so the raised free_invoice_limit() doesn't cover it — the flag must.
  // With the paywall off this early-return is skipped and a canceled user falls
  // through to the free path, where they're under the (now huge) cap.
  if (PAYWALL_ENABLED && raw === 'canceled') return { hasAccess: false, tier: 'canceled', invoiceCount };

  // free / legacy 'standard' / anything unexpected → free tier. The cap is read
  // from the SAME SQL function the trigger uses, so the number is never
  // duplicated. If the rpc fails we do NOT false-block — the trigger is the
  // real enforcement, and hasAccess is only the UX hint.
  const { data: limitData } = await supabase.rpc('free_invoice_limit');
  const limit = typeof limitData === 'number' ? limitData : Number.MAX_SAFE_INTEGER;
  return { hasAccess: invoiceCount < limit, tier: 'free', invoiceCount };
}

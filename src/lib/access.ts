// ═══ ON IT — the ONE access check ═══
// Every paywall gate calls hasAccess(userId). No scattered tier logic.
//
// - 'founder' (access_tier materialized by redeem_grant from an access_grants
//   token, e.g. 'dadcrew') bypasses everything — founders never see a paywall.
// - 'trialing' / 'active' → unlimited (a live subscription).
// - 'past_due' / 'canceled' → paywalled.
// - 'free' (and any legacy value like the old 'standard') → FREE_INVOICE_LIMIT
//   real invoices, then paywalled.
//
// Server-only: it reads the DB with the session client under RLS. The client
// gates via GET /api/access, never by importing this.
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export const FREE_INVOICE_LIMIT = 2;

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
  if (raw === 'trialing' || raw === 'active') return { hasAccess: true, tier: raw, invoiceCount };
  if (raw === 'past_due' || raw === 'canceled') return { hasAccess: false, tier: raw, invoiceCount };
  // free / legacy 'standard' / anything unexpected → free tier
  return { hasAccess: invoiceCount < FREE_INVOICE_LIMIT, tier: 'free', invoiceCount };
}

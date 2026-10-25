// GET /api/prompts — the one soft nudge (lib/soft-prompts.ts) this user should
// see in chat right now, or { prompt: null }. Read-only, RLS-scoped. Whether it
// was dismissed is the device's business (localStorage), not stored here.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { PAYWALL_ENABLED } from '@/lib/paywall';
import { SOFT_PROMPT_WINDOW_DAYS, pickSoftPrompt } from '@/lib/soft-prompts';

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await rateLimit('prompts', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  // Paywall off: nothing here is about upgrading.
  if (!PAYWALL_ENABLED) return NextResponse.json({ prompt: null }, NO_STORE);

  const { data: profile } = await supabase
    .from('profiles')
    .select('access_tier, trial_ends_at')
    .eq('id', user.id)
    .maybeSingle();
  const tier = (profile?.access_tier ?? 'free') as string;

  // Only a free user's prompts depend on activity; the others read the profile.
  let webhookPayments = 0;
  let lastWebhookPaymentAt: string | null = null;
  let estimatesSigned = 0;
  let lastEstimateSignedAt: string | null = null;
  if (tier === 'free') {
    const since = new Date(Date.now() - SOFT_PROMPT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [payments, estimates] = await Promise.all([
      // limit 2: "a single payment" only needs to tell 1 from 2-or-more.
      supabase.from('invoice_payments').select('paid_at')
        .eq('user_id', user.id).eq('paid_source', 'webhook').gte('paid_at', since)
        .order('paid_at', { ascending: false }).limit(2),
      supabase.from('invoices').select('approved_at')
        .eq('user_id', user.id).eq('kind', 'quote').is('deleted_at', null).gte('approved_at', since)
        .order('approved_at', { ascending: false }).limit(1),
    ]);
    // A failed read is "nothing to say", never an error the chat has to handle.
    webhookPayments = payments.data?.length ?? 0;
    lastWebhookPaymentAt = (payments.data?.[0]?.paid_at as string | undefined) ?? null;
    estimatesSigned = estimates.data?.length ?? 0;
    lastEstimateSignedAt = (estimates.data?.[0]?.approved_at as string | undefined) ?? null;
  }

  const prompt = pickSoftPrompt({
    tier,
    trialEndsAt: (profile?.trial_ends_at as string | null | undefined) ?? null,
    webhookPayments,
    lastWebhookPaymentAt,
    estimatesSigned,
    lastEstimateSignedAt,
  });
  return NextResponse.json({ prompt }, NO_STORE);
}

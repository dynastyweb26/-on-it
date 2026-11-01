// POST /api/plaid/sync — the signed-in owner's manual sync.
//   { }        → every linked item of the caller that can sync
//   { item_id } → just that item (404 if it is not the caller's)
//
// Shares the same executor as the webhook. Preview only: 404 unless
// VERCEL_ENV === 'preview'. Node runtime.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { PlaidApiError, plaidClientFromEnv } from '@/lib/plaid/client';
import { syncPlaidItem, type SyncSummary } from '@/lib/plaid/sync';

export const runtime = 'nodejs';

const Body = z.object({ item_id: z.string().uuid().optional() });

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

const errorCode = (error: unknown): string =>
  error instanceof PlaidApiError ? error.error_code : 'sync_failed';

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return notFound();

  const client = plaidClientFromEnv();
  if (!client) return NextResponse.json({ error: 'plaid_not_configured' }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('plaid_sync', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const admin = adminClient();
  const items: SyncSummary[] = [];
  const failures: { item_id: string; error_code: string }[] = [];

  if (parsed.data.item_id) {
    try {
      const summary = await syncPlaidItem(client, admin, parsed.data.item_id, user.id);
      if (!summary) return NextResponse.json({ error: 'not found' }, { status: 404 });
      items.push(summary);
    } catch (error) {
      failures.push({ item_id: parsed.data.item_id, error_code: errorCode(error) });
    }
  } else {
    // needs_reconnect items are left alone: they need a re-login first.
    const { data } = await admin
      .from('plaid_items')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['active', 'syncing']);

    for (const row of (data ?? []) as { id: string }[]) {
      try {
        const summary = await syncPlaidItem(client, admin, row.id, user.id);
        if (summary) items.push(summary);
      } catch (error) {
        failures.push({ item_id: row.id, error_code: errorCode(error) });
      }
    }
  }

  return NextResponse.json({ ok: failures.length === 0, items, failures });
}

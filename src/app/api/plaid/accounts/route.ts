// POST /api/plaid/accounts — turn tracking on/off for one account.
// Only tracked accounts produce bank_transactions; tracking is opt-in and the
// schema requires track and tracked_at to move together.
//
// false → true is a backfill: the sync skipped this account's rows while it was
// untracked, so the item's cursor goes back to null and a sync runs after the
// response. Any other transition only moves the flag.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. Every
// non-2xx goes through fail(), which logs exactly one line.
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import { plaidRouteEnabled } from '@/lib/plaid/config';
import { PlaidApiError, plaidClientFromEnv } from '@/lib/plaid/client';
import { trackPatch } from '@/lib/plaid/link';
import { needsBackfill } from '@/lib/plaid/account-tracking';
import { syncPlaidItem } from '@/lib/plaid/sync';
import { fail } from '@/lib/plaid/respond';
import { ITEMS_SELECT, accountsResponse, type AccountsItemRow } from '@/lib/plaid/accounts-view';

export const runtime = 'nodejs';

const Body = z.object({
  item_id: z.string().uuid(),
  account_id: z.string().uuid(),
  track: z.boolean(),
});

export async function GET(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('accounts', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('accounts', 'unauthorized');

  if (!(await rateLimit('plaid_accounts', rateIdentifier(req, user.id)))) {
    return fail('accounts', 'rate_limited');
  }

  const { data, error } = await supabase
    .from('plaid_items')
    .select(ITEMS_SELECT)
    .neq('status', 'removed')
    .order('created_at', { ascending: false });

  if (error) return fail('accounts', 'db_read_failed', error.code);

  // The nested select is untyped at the client; accountsResponse is the mapper.
  return NextResponse.json(accountsResponse((data ?? []) as unknown as AccountsItemRow[]));
}

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('accounts', 'route_disabled');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('accounts', 'unauthorized');

  if (!(await rateLimit('plaid_accounts', rateIdentifier(req, user.id)))) {
    return fail('accounts', 'rate_limited');
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('accounts', 'invalid_request');
  const { item_id, account_id, track } = parsed.data;

  const admin = adminClient();

  // The previous value first: only a false → true flip needs the replay.
  const { data: current, error: readError } = await admin
    .from('plaid_accounts')
    .select('id, track')
    .eq('id', account_id)
    .eq('item_id', item_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) return fail('accounts', 'db_read_failed', readError.code);
  if (!current) return fail('accounts', 'not_found');

  const { error } = await admin
    .from('plaid_accounts')
    .update(trackPatch(track, new Date().toISOString()))
    .eq('id', account_id)
    .eq('item_id', item_id)
    .eq('user_id', user.id);

  if (error) return fail('accounts', 'db_update_failed', error.code);

  if (needsBackfill(current.track === true, track)) {
    // Cursor to null so the next sync replays the window with this account
    // tracked, instead of resuming past the rows it skipped.
    const { error: resetError } = await admin
      .from('plaid_items')
      .update({ sync_cursor: null, updated_at: new Date().toISOString() })
      .eq('id', item_id)
      .eq('user_id', user.id);

    if (resetError) return fail('accounts', 'db_update_failed', resetError.code);

    const client = plaidClientFromEnv();
    if (client) {
      const task = syncPlaidItem(client, admin, item_id, user.id)
        .then(() => undefined)
        .catch((error: unknown) => {
          console.error('plaid: backfill sync failed', {
            error_code: error instanceof PlaidApiError ? error.error_code : 'sync_failed',
          });
        });
      try {
        waitUntil(task);
      } catch {
        // Outside a Vercel request (or with no waitUntil support): keep the
        // function alive for the bounded sync instead of dropping it.
        await task;
      }
    }
  }

  const { data: accounts } = await admin
    .from('plaid_accounts')
    .select('id, plaid_account_id, name, official_name, mask, type, subtype, track, tracked_at')
    .eq('item_id', item_id)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ ok: true, accounts: accounts ?? [] });
}

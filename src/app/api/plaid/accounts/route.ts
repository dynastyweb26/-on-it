// GET  /api/plaid/accounts — the owner's linked item and its accounts.
// POST /api/plaid/accounts — turn tracking on/off for one account, or for a
//                            batch of them in one request.
//
// The GET reads through the SESSION client, so RLS (owner-only) is the boundary
// and the admin key never touches this path. Only the columns named in
// ./accounts-view can be returned: no encrypted token, Plaid item id, cursor or
// error text. Items answer newest first; the screen shows the newest only.
//
// Only tracked accounts produce bank_transactions; tracking is opt-in and the
// schema requires track and tracked_at to move together. false → true is a
// backfill: the sync skipped this account's rows while it was untracked, so the
// item's cursor goes back to null and ONE sync runs after the response — however
// many accounts the batch turned on.
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
import {
  MAX_TRACK_CHANGES, backfillWanted, trackGroups, unknownAccountIds, type TrackChange,
} from '@/lib/plaid/accounts-batch';
import { ITEMS_SELECT, accountsResponse, type AccountsItemRow } from '@/lib/plaid/accounts-view';
import { syncPlaidItem } from '@/lib/plaid/sync';
import { fail } from '@/lib/plaid/respond';

export const runtime = 'nodejs';

const Change = z.object({
  account_id: z.string().uuid(),
  track: z.boolean(),
});

const Batch = z.object({
  item_id: z.string().uuid(),
  changes: z.array(Change).min(1).max(MAX_TRACK_CHANGES),
});

const Single = z.object({
  item_id: z.string().uuid(),
  account_id: z.string().uuid(),
  track: z.boolean(),
});

/** The single-account body and the batch body land on the same change list. */
const Body = z.union([Batch, Single]);

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
  const { item_id } = parsed.data;
  const changes: TrackChange[] = 'changes' in parsed.data
    ? parsed.data.changes
    : [{ account_id: parsed.data.account_id, track: parsed.data.track }];

  const admin = adminClient();

  // One read for every id in the body: the previous value decides the backfill,
  // and an id outside this item (or this user) refuses the whole request.
  const { data: current, error: readError } = await admin
    .from('plaid_accounts')
    .select('id, track')
    .eq('item_id', item_id)
    .eq('user_id', user.id)
    .in('id', changes.map((change) => change.account_id));

  if (readError) return fail('accounts', 'db_read_failed', readError.code);
  if (unknownAccountIds(current ?? [], changes).length > 0) return fail('accounts', 'not_found');

  const now = new Date().toISOString();
  for (const group of trackGroups(changes)) {
    const { error } = await admin
      .from('plaid_accounts')
      .update(trackPatch(group.track, now))
      .in('id', group.ids)
      .eq('item_id', item_id)
      .eq('user_id', user.id);

    if (error) return fail('accounts', 'db_update_failed', error.code);
  }

  if (backfillWanted(current ?? [], changes)) {
    // Cursor to null so the next sync replays the window with these accounts
    // tracked, instead of resuming past the rows it skipped.
    const { error: resetError } = await admin
      .from('plaid_items')
      .update({ sync_cursor: null, updated_at: now })
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

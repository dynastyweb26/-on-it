// POST /api/plaid/exchange — public_token → access token, then the item.
//
// The access token is handed straight to create_plaid_item (encrypted with
// PLAID_TOKEN_ENC_KEY) and is never returned, logged or put in an error. The
// same bank linked twice (same institution + a shared account mask) is refused
// before a row exists, and the fresh Plaid item is removed again.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime. Every
// non-2xx goes through fail(), which logs exactly one line.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import {
  plaidRouteEnabled, plaidTokenKey, plaidWebhookUrl,
} from '@/lib/plaid/config';
import { isDuplicateLink, type LinkedBank } from '@/lib/plaid/link';
import { PlaidApiError, plaidClientFromEnv, type PlaidAccount } from '@/lib/plaid/client';
import { fail } from '@/lib/plaid/respond';

export const runtime = 'nodejs';

const Body = z.object({
  public_token: z.string().min(1).max(1000),
  institution_name: z.string().max(200).optional(),
});

type ExistingLink = {
  plaid_item_id: string;
  institution_id: string | null;
  plaid_accounts: { mask: string | null }[] | null;
};

/** Plaid's error_code or Postgres SQLSTATE for the log line; never a token. */
const codeOf = (error: unknown): string | null => {
  if (error instanceof PlaidApiError) return error.error_code;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
};

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return fail('exchange', 'route_disabled');

  const client = plaidClientFromEnv();
  const tokenKey = plaidTokenKey();
  if (!client || !tokenKey || !plaidWebhookUrl(process.env.VERCEL_URL)) {
    return fail('exchange', 'plaid_not_configured');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // The 401 carries copy the client shows instead of the generic text.
  if (!user) return fail('exchange', 'unauthorized');

  if (!(await rateLimit('plaid_exchange', rateIdentifier(req, user.id)))) {
    return fail('exchange', 'rate_limited');
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail('exchange', 'invalid_request');

  const admin = adminClient();
  let accessToken: string;
  let plaidItemId: string;
  try {
    const exchanged = await client.itemPublicTokenExchange(parsed.data.public_token);
    accessToken = exchanged.access_token;
    plaidItemId = exchanged.item_id;
  } catch (error) {
    return fail('exchange', 'exchange_failed', codeOf(error));
  }

  // Cleanup only. A failure here cannot change the outcome, so it adds no
  // second log line to the one fail() writes.
  const removeOrphan = async () => {
    try {
      await client.itemRemove(accessToken);
    } catch { /* the orphaned sandbox item is unusable; outcome unchanged */ }
  };

  // The institution and its accounts are read server-side; the client-supplied
  // name is only a fallback for display.
  let institutionId: string | null;
  let accounts: PlaidAccount[];
  let institutionName: string;
  try {
    const itemInfo = await client.itemGet(accessToken);
    institutionId = itemInfo.institution_id;
    const fetched = await client.accountsGet(accessToken);
    accounts = fetched.accounts;
    const institution = institutionId ? await client.institutionsGetById(institutionId) : null;
    institutionName =
      institution?.name?.slice(0, 200) ||
      parsed.data.institution_name?.trim().slice(0, 200) ||
      'Bank';
  } catch (error) {
    const code = codeOf(error);
    await removeOrphan();
    return fail('exchange', 'exchange_failed', code);
  }

  const { data: existingRows, error: existingError } = await admin
    .from('plaid_items')
    .select('plaid_item_id, institution_id, plaid_accounts(mask)')
    .eq('user_id', user.id);
  if (existingError) {
    await removeOrphan();
    return fail('exchange', 'db_read_failed', existingError.code);
  }

  const existing: LinkedBank[] = ((existingRows ?? []) as ExistingLink[]).map((row) => ({
    institutionId: row.institution_id,
    masks: (row.plaid_accounts ?? []).map((account) => account.mask),
  }));
  if (isDuplicateLink(
    { institutionId, masks: accounts.map((account) => account.mask) },
    existing,
  )) {
    // A fresh Plaid item is safe to remove; the SAME item re-exchanged is the
    // already-linked connection — removing it would break that link.
    const sameItem = ((existingRows ?? []) as ExistingLink[])
      .some((row) => row.plaid_item_id === plaidItemId);
    if (!sameItem) await removeOrphan();
    return fail('exchange', 'already_linked');
  }

  // The only write path for the token: one SECURITY DEFINER call that inserts
  // the row and its encrypted token together (status defaults to 'syncing').
  let itemRowId: string;
  try {
    const { data, error } = await admin.rpc('create_plaid_item', {
      p_user: user.id,
      p_item_id: plaidItemId,
      p_institution_id: institutionId,
      p_institution_name: institutionName,
      p_token: accessToken,
      p_key: tokenKey,
    });
    if (error || typeof data !== 'string') throw error ?? new Error('missing item');
    itemRowId = data;
  } catch (error) {
    const code = codeOf(error);
    if (code === '23505') {
      // plaid_item_id is already ours: never remove the live connection.
      return fail('exchange', 'already_linked');
    }
    await removeOrphan();
    return fail('exchange', 'db_insert_failed', code);
  }

  // Tracking is opt-in: every account starts untracked (tracked_at null).
  const rows = accounts.map((account) => ({
    user_id: user.id,
    item_id: itemRowId,
    plaid_account_id: account.account_id,
    name: (account.name || account.official_name || 'Account').slice(0, 200),
    official_name: account.official_name?.slice(0, 200) ?? null,
    mask: account.mask?.slice(0, 12) ?? null,
    type: account.type?.slice(0, 40) ?? null,
    subtype: account.subtype?.slice(0, 40) ?? null,
    track: false,
    tracked_at: null,
  }));

  if (rows.length > 0) {
    const { error } = await admin.from('plaid_accounts').insert(rows);
    if (error) {
      // No half-linked item: deleting the item cascades any partial rows.
      await admin.from('plaid_items').delete().eq('id', itemRowId).eq('user_id', user.id);
      return fail('exchange', 'db_insert_failed', error.code);
    }
  }

  const { data: savedAccounts } = await admin
    .from('plaid_accounts')
    .select('id, plaid_account_id, name, mask, type, subtype, track')
    .eq('item_id', itemRowId)
    .eq('user_id', user.id);

  return NextResponse.json({
    item_id: itemRowId,
    institution_name: institutionName,
    accounts: savedAccounts ?? [],
  });
}

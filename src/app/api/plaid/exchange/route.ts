// POST /api/plaid/exchange — public_token → access token, then the item.
//
// The access token is handed straight to create_plaid_item (encrypted with
// PLAID_TOKEN_ENC_KEY) and is never returned, logged or put in an error. The
// same bank linked twice (same institution + a shared account mask) is refused
// before a row exists, and the fresh Plaid item is removed again.
//
// Preview only: 404 unless VERCEL_ENV === 'preview'. Node runtime.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import { rateLimit, rateIdentifier } from '@/lib/ratelimit';
import {
  plaidRouteEnabled, plaidTokenKey, plaidWebhookUrl,
} from '@/lib/plaid/config';
import { DUPLICATE_LINK_MESSAGE, isDuplicateLink, type LinkedBank } from '@/lib/plaid/link';
import { PlaidApiError, plaidClientFromEnv, type PlaidAccount } from '@/lib/plaid/client';

export const runtime = 'nodejs';

const Body = z.object({
  public_token: z.string().min(1).max(1000),
  institution_name: z.string().max(200).optional(),
});

const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404 });

type ExistingLink = {
  plaid_item_id: string;
  institution_id: string | null;
  plaid_accounts: { mask: string | null }[] | null;
};

export async function POST(req: NextRequest) {
  if (!plaidRouteEnabled(process.env.VERCEL_ENV)) return notFound();

  const client = plaidClientFromEnv();
  const tokenKey = plaidTokenKey();
  if (!client || !tokenKey || !plaidWebhookUrl(process.env.VERCEL_URL)) {
    return NextResponse.json({ error: 'plaid_not_configured' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!(await rateLimit('plaid_exchange', rateIdentifier(req, user.id)))) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });

  const admin = adminClient();
  let accessToken: string;
  let plaidItemId: string;
  try {
    const exchanged = await client.itemPublicTokenExchange(parsed.data.public_token);
    accessToken = exchanged.access_token;
    plaidItemId = exchanged.item_id;
  } catch (error) {
    console.error('plaid: exchange failed', {
      error_code: error instanceof PlaidApiError ? error.error_code : 'unknown',
    });
    return NextResponse.json({ error: 'exchange_failed' }, { status: 502 });
  }

  const removeOrphan = async () => {
    try {
      await client.itemRemove(accessToken);
    } catch (error) {
      console.error('plaid: cleanup /item/remove failed', {
        error_code: error instanceof PlaidApiError ? error.error_code : 'unknown',
      });
    }
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
    console.error('plaid: account read failed', {
      error_code: error instanceof PlaidApiError ? error.error_code : 'unknown',
    });
    await removeOrphan();
    return NextResponse.json({ error: 'exchange_failed' }, { status: 502 });
  }

  const { data: existingRows, error: existingError } = await admin
    .from('plaid_items')
    .select('plaid_item_id, institution_id, plaid_accounts(mask)')
    .eq('user_id', user.id);
  if (existingError) {
    await removeOrphan();
    return NextResponse.json({ error: 'exchange_failed' }, { status: 500 });
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
    return NextResponse.json(
      { error: 'already_linked', message: DUPLICATE_LINK_MESSAGE },
      { status: 409 },
    );
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
    const code = (error as { code?: string } | null)?.code;
    console.error('plaid: item insert failed', { error_code: code ?? 'unknown' });
    if (code === '23505') {
      // plaid_item_id is already ours: never remove the live connection.
      return NextResponse.json(
        { error: 'already_linked', message: DUPLICATE_LINK_MESSAGE },
        { status: 409 },
      );
    }
    await removeOrphan();
    return NextResponse.json({ error: 'exchange_failed' }, { status: 500 });
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
      console.error('plaid: account insert failed', { code: error.code });
      return NextResponse.json({ error: 'exchange_failed' }, { status: 500 });
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

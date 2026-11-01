// ═══ Plaid item helpers (server only) ═══
// Token decryption stays behind the two SECURITY DEFINER functions from PR1;
// this module never returns a token to a caller that could serialise it.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { plaidTokenKey } from './config';
import { plaidClientFromEnv, PlaidApiError, type PlaidClient } from './client';

export type Admin = ReturnType<typeof adminClient>;

/** Decrypted access token for one item, or null (no key / no token). */
export async function plaidAccessToken(admin: Admin, itemId: string): Promise<string | null> {
  const key = plaidTokenKey();
  if (!key) return null;
  const { data, error } = await admin.rpc('get_plaid_access_token', { p_item: itemId, p_key: key });
  if (error) return null;
  return typeof data === 'string' && data.length > 0 ? data : null;
}

export type RemoveResult = { itemId: string; plaidRemoved: boolean };

/** /item/remove, then the local row (which cascades to accounts + transactions). */
export async function removePlaidItem(
  client: PlaidClient | null,
  admin: Admin,
  itemId: string,
  userId: string,
): Promise<RemoveResult> {
  let plaidRemoved = false;
  if (client) {
    const token = await plaidAccessToken(admin, itemId);
    if (token) {
      try {
        await client.itemRemove(token);
        plaidRemoved = true;
      } catch (error) {
        // The owner asked to disconnect: a Plaid-side failure must never trap
        // them. Log the code only — never the token or the request.
        console.error('plaid: /item/remove failed on disconnect', {
          item_id: itemId,
          error_code: error instanceof PlaidApiError ? error.error_code : 'unknown',
        });
      }
    }
  }

  const { error } = await admin
    .from('plaid_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);
  if (error) throw error;
  return { itemId, plaidRemoved };
}

/**
 * Account deletion: tell Plaid about every item BEFORE the profile cascade
 * drops the rows. Best effort — the account delete proceeds even when Plaid
 * errors, and only a code is logged.
 */
export async function removePlaidItemsForUser(
  admin: Admin,
  userId: string,
): Promise<{ items: number; removed: number }> {
  const client = plaidClientFromEnv();
  if (!client) return { items: 0, removed: 0 };

  const { data, error } = await admin
    .from('plaid_items')
    .select('id')
    .eq('user_id', userId);
  if (error) throw error;

  const items = (data ?? []) as { id: string }[];
  let removed = 0;
  for (const item of items) {
    const token = await plaidAccessToken(admin, item.id);
    if (!token) continue;
    try {
      await client.itemRemove(token);
      removed++;
    } catch (error) {
      console.error('plaid: /item/remove failed during account deletion', {
        item_id: item.id,
        error_code: error instanceof PlaidApiError ? error.error_code : 'unknown',
      });
    }
  }
  return { items: items.length, removed };
}

/** PENDING_EXPIRATION / ITEM ERROR webhooks: the owner must re-authenticate. */
export async function markItemNeedsReconnect(
  admin: Admin,
  plaidItemId: string,
  reason: string,
): Promise<void> {
  const { error } = await admin
    .from('plaid_items')
    .update({
      status: 'needs_reconnect',
      last_sync_error: reason.slice(0, 400),
      updated_at: new Date().toISOString(),
    })
    .eq('plaid_item_id', plaidItemId);
  if (error) throw error;
}

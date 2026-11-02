// ═══ Plaid transactions/sync executor ═══
// One item at a time, scoped by user_id on every statement. The pure page
// reducer (sync-reducer.ts) decides the writes; the pure loop (sync-loop.ts)
// enforces commit-before-cursor; this file only talks to Plaid and Supabase.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { PlaidApiError, type PlaidClient } from './client';
import { plaidAccessToken, type Admin } from './items';
import {
  planTransactionPage,
  type ExistingBankRow,
  type PlaidRemovedTransaction,
  type PlaidSyncTransaction,
  type SyncPlan,
  type SyncSkipCounts,
} from './sync-reducer';
import { isItemLoginError, isPaginationMutation, runSyncPages } from './sync-loop';
import { syncErrorText, syncWindowStart } from './sync-window';

const MAX_PAGES = 20;
const EXISTING_CHUNK = 100;

export type SyncSummary = {
  itemId: string;
  pages: number;
  restarts: number;
  inserts: number;
  updates: number;
  skipped: SyncSkipCounts;
  moreRemaining: boolean;
};

type ItemRow = {
  id: string;
  user_id: string;
  sync_cursor: string | null;
  status: string;
  linked_at: string;
};

const chunk = <T>(values: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
};

async function loadItem(admin: Admin, itemId: string, userId: string): Promise<ItemRow | null> {
  const { data, error } = await admin
    .from('plaid_items')
    .select('id, user_id, sync_cursor, status, linked_at')
    .eq('id', itemId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ItemRow | null) ?? null;
}

/**
 * Sync one item the caller owns. Returns null when the item does not belong to
 * that user (the routes turn that into a 404, never a cross-user read).
 */
export async function syncPlaidItem(
  client: PlaidClient,
  admin: Admin,
  itemId: string,
  userId: string,
): Promise<SyncSummary | null> {
  const item = await loadItem(admin, itemId, userId);
  if (!item) return null;

  const token = await plaidAccessToken(admin, itemId);
  if (!token) throw new PlaidApiError('ACCESS_TOKEN_UNAVAILABLE', 'ITEM_ERROR', 'Access token unavailable');

  const { data: accountRows, error: accountError } = await admin
    .from('plaid_accounts')
    .select('id, plaid_account_id, track')
    .eq('item_id', itemId)
    .eq('user_id', userId);
  if (accountError) throw accountError;

  const trackedAccountIds: Record<string, string> = {};
  for (const account of (accountRows ?? []) as { id: string; plaid_account_id: string; track: boolean }[]) {
    if (account.track) trackedAccountIds[account.plaid_account_id] = account.id;
  }

  const windowStart = syncWindowStart(item.linked_at);
  const totals = {
    inserts: 0,
    updates: 0,
    skipped: {
      pending: 0, moneyIn: 0, outsideWindow: 0, untrackedAccount: 0,
      unknownRemoved: 0, removedBeforeInsert: 0,
    } satisfies SyncSkipCounts,
  };

  try {
    const result = await runSyncPages<PlaidSyncTransaction, SyncPlan, PlaidRemovedTransaction>({
      startCursor: item.sync_cursor,
      maxPages: MAX_PAGES,
      isPaginationMutation,

      fetchPage: async (cursor) => {
        const page = await client.transactionsSync(token, cursor);
        return {
          added: page.added,
          modified: page.modified,
          removed: page.removed,
          nextCursor: page.next_cursor,
          hasMore: page.has_more,
        };
      },

      planPage: async (page) => {
        const ids = new Set<string>();
        for (const txn of [...page.added, ...page.modified]) {
          ids.add(txn.transaction_id);
          if (txn.pending_transaction_id) ids.add(txn.pending_transaction_id);
        }
        for (const removed of page.removed) {
          ids.add(removed.transaction_id);
          if (removed.pending_transaction_id) ids.add(removed.pending_transaction_id);
        }

        const existing: ExistingBankRow[] = [];
        for (const part of chunk([...ids], EXISTING_CHUNK)) {
          const { data, error } = await admin
            .from('bank_transactions')
            .select('id, plaid_transaction_id, bank_state, review_state, expense_id')
            .eq('user_id', userId)
            .in('plaid_transaction_id', part);
          if (error) throw error;
          existing.push(...((data ?? []) as ExistingBankRow[]));
        }

        return planTransactionPage({
          userId,
          itemId,
          added: page.added,
          modified: page.modified,
          removed: page.removed,
          existing,
          trackedAccountIds,
          windowStart,
          removedAt: new Date().toISOString(),
        });
      },

      commitPage: async (plan: SyncPlan) => {
        if (plan.inserts.length > 0) {
          const { error } = await admin
            .from('bank_transactions')
            .upsert(plan.inserts, {
              onConflict: 'user_id,plaid_transaction_id',
              ignoreDuplicates: true,
            });
          if (error) throw error;
        }
        for (const update of plan.updates) {
          const { error } = await admin
            .from('bank_transactions')
            .update(update.patch)
            .eq('id', update.id)
            .eq('user_id', userId);
          if (error) throw error;
        }
        totals.inserts += plan.inserts.length;
        totals.updates += plan.updates.length;
        totals.skipped.pending += plan.skipped.pending;
        totals.skipped.moneyIn += plan.skipped.moneyIn;
        totals.skipped.outsideWindow += plan.skipped.outsideWindow;
        totals.skipped.untrackedAccount += plan.skipped.untrackedAccount;
        totals.skipped.unknownRemoved += plan.skipped.unknownRemoved;
        totals.skipped.removedBeforeInsert += plan.skipped.removedBeforeInsert;
      },

      saveCursor: async (cursor) => {
        // Only after the page's rows committed (constraint: cursor needs a
        // last_synced_at, so both move together).
        const { error } = await admin
          .from('plaid_items')
          .update({
            sync_cursor: cursor,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemId)
          .eq('user_id', userId);
        if (error) throw error;
      },
    });

    const now = new Date().toISOString();
    const { error } = await admin
      .from('plaid_items')
      .update({ status: 'active', last_sync_error: null, last_synced_at: now, updated_at: now })
      .eq('id', itemId)
      .eq('user_id', userId);
    if (error) throw error;

    return {
      itemId,
      pages: result.pages,
      restarts: result.restarts,
      inserts: totals.inserts,
      updates: totals.updates,
      skipped: totals.skipped,
      moreRemaining: result.moreRemaining,
    };
  } catch (error) {
    const now = new Date().toISOString();
    const { error: stampError } = await admin
      .from('plaid_items')
      .update({
        status: isItemLoginError(error) ? 'needs_reconnect' : item.status,
        last_sync_error: syncErrorText(error),
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId);
    if (stampError) {
      console.error('plaid: failed to record sync error', { item_id: itemId, error_code: stampError.code });
    }
    throw error;
  }
}

/**
 * Webhook path: Plaid only identifies its own item id, so the owner comes from
 * the row (never from the request). Every write is still scoped by user_id.
 */
export async function syncPlaidItemByPlaidItemId(
  client: PlaidClient,
  admin: Admin,
  plaidItemId: string,
): Promise<SyncSummary | null> {
  const { data, error } = await admin
    .from('plaid_items')
    .select('id, user_id')
    .eq('plaid_item_id', plaidItemId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { id: string; user_id: string } | null;
  if (!row) return null;
  return syncPlaidItem(client, admin, row.id, row.user_id);
}

export function plaidAdmin(): Admin {
  return adminClient();
}

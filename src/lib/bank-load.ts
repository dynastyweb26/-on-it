// ═══ Loading the real connection ═══
// The rules around GET/POST /api/plaid/accounts, kept out of the component so
// they can be tested: what a response means, the one batch body Start tracking
// sends, and how long a syncing item is re-read. Pure — the screen does the
// fetch, and bank-tracking.test.ts counts the /api literals there.
import type { BankItemApi } from './bank-accounts';

const isBankItem = (value: unknown): value is BankItemApi => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && item.id.length > 0 && Array.isArray(item.accounts);
};

export type AccountsPlan =
  | { kind: 'none' }
  | { kind: 'items'; items: BankItemApi[] }
  | { kind: 'error' };

/**
 * What a GET /api/plaid/accounts response means. 404 is the preview gate (the
 * screen keeps its current behaviour); a 2xx with nothing linked is 'items'
 * with an empty list; anything else is a real error, never a silent reset.
 */
export function accountsPlan(status: number, body: unknown): AccountsPlan {
  if (status === 404) return { kind: 'none' };
  if (status >= 200 && status < 300) {
    const items = (body as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) return { kind: 'items', items: items.filter(isBankItem) };
  }
  return { kind: 'error' };
}

/** The batch body the screen sends: only the accounts that were turned on. */
export function trackingBatch(itemId: string, accountIds: string[]): {
  item_id: string;
  changes: { account_id: string; track: true }[];
} {
  return {
    item_id: itemId,
    changes: accountIds.map((account_id) => ({ account_id, track: true as const })),
  };
}

// A real item syncs after the link; the screen re-reads until it settles.
export const BANK_POLL_MS = 6000;
export const BANK_POLL_MAX_TRIES = 20;

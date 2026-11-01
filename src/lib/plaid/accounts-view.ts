// ═══ GET /api/plaid/accounts — the one payload the bank screen reads ═══
// Pure: the route hands in what its session client (RLS, owner-only) read, and
// this module decides what may leave the server. The column lists are the
// allow-list — no encrypted access token, no Plaid item id, no sync cursor and
// no error text, so a column that is not named here cannot be returned.

export const ITEM_COLUMNS = ['id', 'institution_name', 'status', 'last_synced_at'] as const;
export const ACCOUNT_COLUMNS = ['id', 'name', 'mask', 'type', 'subtype', 'track'] as const;

export const ITEM_SELECT = ITEM_COLUMNS.join(', ');
export const ITEMS_SELECT = `${ITEM_SELECT}, plaid_accounts(${ACCOUNT_COLUMNS.join(', ')})`;

export type AccountsAccountRow = {
  id: string;
  name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  track: boolean | null;
};

export type AccountsItemRow = {
  id: string;
  institution_name: string | null;
  status: string;
  last_synced_at: string | null;
  plaid_accounts?: AccountsAccountRow[] | null;
};

export type AccountsApiAccount = {
  id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  track: boolean;
};

export type AccountsApiItem = {
  id: string;
  institution_name: string | null;
  status: string;
  last_synced_at: string | null;
  accounts: AccountsApiAccount[];
};

/**
 * The response body. `removed` items are filtered here as well as in the query:
 * a disconnected item must never reach the screen, whatever the caller passed.
 * An account's name falls back to a neutral label so a bank always has one.
 */
export function accountsResponse(rows: AccountsItemRow[] | null | undefined): { items: AccountsApiItem[] } {
  return {
    items: (rows ?? [])
      .filter((row) => row.status !== 'removed')
      .map((row) => ({
        id: row.id,
        institution_name: row.institution_name,
        status: row.status,
        last_synced_at: row.last_synced_at,
        accounts: (row.plaid_accounts ?? []).map((account) => ({
          id: account.id,
          name: account.name?.trim() || 'Account',
          mask: account.mask,
          type: account.type,
          subtype: account.subtype,
          track: account.track === true,
        })),
      })),
  };
}

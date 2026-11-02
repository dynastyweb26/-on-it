// ═══ Plaid API client (server only) ═══
// A deliberately small fetch wrapper for the calls this feature makes. The
// client id and secret are attached here and never leave the server; the access
// token is passed per call and never logged, returned or embedded in an error.
//
// The interface is injectable: route code takes a PlaidClient, and the sync
// orchestrator is tested with fakes (no network anywhere in the test suite).
import 'server-only';
import type { JsonWebKey } from 'node:crypto';
import { plaidCredentials } from './config';
import type { PlaidSyncTransaction, PlaidRemovedTransaction } from './sync-reducer';

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

export type PlaidSyncResponse = {
  added: PlaidSyncTransaction[];
  modified: PlaidSyncTransaction[];
  removed: PlaidRemovedTransaction[];
  next_cursor: string;
  has_more: boolean;
};

export type PlaidItemInfo = {
  item_id: string;
  institution_id: string | null;
};

export class PlaidApiError extends Error {
  error_code: string;
  error_type: string;
  constructor(errorCode: string, errorType: string, message: string) {
    super(message);
    this.name = 'PlaidApiError';
    this.error_code = errorCode;
    this.error_type = errorType;
  }
}

export interface PlaidClient {
  linkTokenCreate(request: Record<string, unknown>): Promise<{ link_token: string }>;
  itemPublicTokenExchange(publicToken: string): Promise<{ access_token: string; item_id: string }>;
  itemGet(accessToken: string): Promise<PlaidItemInfo>;
  accountsGet(accessToken: string): Promise<{ accounts: PlaidAccount[] }>;
  institutionsGetById(institutionId: string): Promise<{ name: string } | null>;
  transactionsSync(accessToken: string, cursor: string | null): Promise<PlaidSyncResponse>;
  itemRemove(accessToken: string): Promise<void>;
  webhookVerificationKeyGet(kid: string): Promise<{ key: JsonWebKey }>;
}

const TIMEOUT_MS = 15_000;

/** Base URL + credentials, or null when this deployment has no Plaid env. */
export function plaidClientFromEnv(): PlaidClient | null {
  const credentials = plaidCredentials();
  if (!credentials) return null;
  const { clientId, secret, baseUrl } = credentials;

  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, ...body }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new PlaidApiError('PLAID_UNAVAILABLE', 'API_ERROR', 'Plaid could not be reached');
    }

    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !payload || typeof payload.error_code === 'string') {
      const code = typeof payload?.error_code === 'string' ? payload.error_code : `HTTP_${response.status}`;
      const type = typeof payload?.error_type === 'string' ? payload.error_type : 'API_ERROR';
      const message = typeof payload?.error_message === 'string' ? payload.error_message : 'Plaid request failed';
      throw new PlaidApiError(code, type, message);
    }
    return payload as T;
  }

  return {
    linkTokenCreate: (request) => post('/link/token/create', request),

    itemPublicTokenExchange: async (publicToken) => {
      const data = await post<{ access_token: string; item_id: string }>('/item/public_token/exchange', {
        public_token: publicToken,
      });
      return { access_token: data.access_token, item_id: data.item_id };
    },

    itemGet: async (accessToken) => {
      const data = await post<{ item: PlaidItemInfo }>('/item/get', { access_token: accessToken });
      return {
        item_id: data.item.item_id,
        institution_id: data.item.institution_id ?? null,
      };
    },

    accountsGet: async (accessToken) => {
      const data = await post<{ accounts: PlaidAccount[] }>('/accounts/get', { access_token: accessToken });
      return { accounts: data.accounts };
    },

    institutionsGetById: async (institutionId) => {
      try {
        const data = await post<{ institution: { name: string } }>('/institutions/get_by_id', {
          institution_id: institutionId,
          country_codes: ['US'],
        });
        return data.institution ?? null;
      } catch {
        // The name is display-only; a lookup failure must not block a link.
        return null;
      }
    },

    transactionsSync: async (accessToken, cursor) => {
      const data = await post<PlaidSyncResponse>('/transactions/sync', {
        access_token: accessToken,
        ...(cursor ? { cursor } : {}),
        count: 500,
      });
      return {
        added: data.added ?? [],
        modified: data.modified ?? [],
        removed: data.removed ?? [],
        next_cursor: data.next_cursor,
        has_more: data.has_more === true,
      };
    },

    itemRemove: async (accessToken) => {
      await post('/item/remove', { access_token: accessToken });
    },

    webhookVerificationKeyGet: async (kid) => {
      const data = await post<{ key: JsonWebKey }>('/webhook_verification_key/get', { key_id: kid });
      return { key: data.key };
    },
  };
}

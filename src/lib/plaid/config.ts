// ═══ Plaid money-out — server config + the fail-closed gate ═══
// Every /api/plaid/* route starts with plaidRouteEnabled(). Only a Vercel
// *preview* build may touch the routes at all; production, local development
// and a missing VERCEL_ENV all 404 as if the route did not exist.
//
// Pure by design (no server-only import, no client): the gate, the base-URL
// mapping and the webhook URL are unit-tested.

export const PLAID_WEBHOOK_PATH = '/api/plaid/webhook';

/** Fail closed: only VERCEL_ENV === 'preview' turns the routes on. */
export function plaidRouteEnabled(vercelEnv: string | undefined): boolean {
  return vercelEnv === 'preview';
}

/**
 * PLAID_ENV → API base. An unset/blank value means sandbox (the .env.example
 * default and the only credentials this branch is allowed to hold). Anything
 * unrecognised returns null so a typo can never silently point at production.
 */
export function plaidBaseUrl(plaidEnv: string | undefined): string | null {
  const env = (plaidEnv ?? '').trim().toLowerCase();
  if (env === '' || env === 'sandbox') return 'https://sandbox.plaid.com';
  if (env === 'production') return 'https://production.plaid.com';
  return null;
}

export type PlaidCredentials = { clientId: string; secret: string; baseUrl: string };

/** Credentials for the server client, or null when the deployment has none. */
export function plaidCredentials(env: Record<string, string | undefined> = process.env): PlaidCredentials | null {
  const clientId = env.PLAID_CLIENT_ID?.trim();
  const secret = env.PLAID_SECRET?.trim();
  const baseUrl = plaidBaseUrl(env.PLAID_ENV);
  if (!clientId || !secret || !baseUrl) return null;
  return { clientId, secret, baseUrl };
}

/**
 * The webhook Plaid should call. On a preview deployment VERCEL_URL is that
 * deployment's own host, so a sandbox item is only ever pointed at the preview
 * that created it.
 */
export function plaidWebhookUrl(vercelUrl: string | undefined): string | null {
  const host = (vercelUrl ?? '').trim();
  if (!host) return null;
  return `https://${host}${PLAID_WEBHOOK_PATH}`;
}

/** Token encryption key for create_plaid_item / get_plaid_access_token. */
export function plaidTokenKey(env: Record<string, string | undefined> = process.env): string | null {
  const key = env.PLAID_TOKEN_ENC_KEY?.trim();
  return key ? key : null;
}

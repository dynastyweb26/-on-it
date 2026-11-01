// ═══ Plaid route failures — one stable line per non-2xx ═══
// Every response the four interactive routes answer with a non-2xx status goes
// through fail() (./respond.ts), which logs exactly one line:
//
//   plaid <route> <http-status> <reason-code>
//
// The reason is built from this fixed table plus a sanitized Plaid/Postgres
// code. A token, key, email or request body can never reach the line: callers
// pass a code, and anything outside [A-Za-z0-9_] is stripped, so a hostile
// value also cannot inject a second log line.
import { DUPLICATE_LINK_MESSAGE } from './link';

/** The exchange route's 401 carries this, so the client can say it plainly. */
export const SIGN_IN_AGAIN_MESSAGE = 'Sign in again to connect your bank.';

export type PlaidRoute = 'link-token' | 'exchange' | 'accounts' | 'disconnect';

export type FailureKind =
  | 'route_disabled'
  | 'unauthorized'
  | 'plaid_not_configured'
  | 'rate_limited'
  | 'invalid_request'
  | 'not_found'
  | 'item_unavailable'
  | 'link_token_failed'
  | 'exchange_failed'
  | 'already_linked'
  | 'db_read_failed'
  | 'db_insert_failed'
  | 'db_update_failed'
  | 'db_delete_failed';

type Spec = {
  status: number;
  /** The public `error` value the client already expects. */
  error: string;
};

const SPEC: Record<FailureKind, Spec> = {
  route_disabled: { status: 404, error: 'not found' },
  unauthorized: { status: 401, error: 'unauthorized' },
  plaid_not_configured: { status: 503, error: 'plaid_not_configured' },
  rate_limited: { status: 429, error: 'rate limited' },
  invalid_request: { status: 400, error: 'invalid request' },
  not_found: { status: 404, error: 'not found' },
  item_unavailable: { status: 409, error: 'item_unavailable' },
  link_token_failed: { status: 502, error: 'link_token_failed' },
  exchange_failed: { status: 502, error: 'exchange_failed' },
  already_linked: { status: 409, error: 'already_linked' },
  db_read_failed: { status: 500, error: 'exchange_failed' },
  db_insert_failed: { status: 500, error: 'exchange_failed' },
  db_update_failed: { status: 500, error: 'update_failed' },
  db_delete_failed: { status: 500, error: 'disconnect_failed' },
};

/** Kinds whose reason carries a Plaid error_code or Postgres SQLSTATE. */
const DETAILED = new Set<FailureKind>([
  'link_token_failed',
  'exchange_failed',
  'db_read_failed',
  'db_insert_failed',
  'db_update_failed',
  'db_delete_failed',
]);

/** Only a code survives: no spaces, newlines, punctuation or long payloads. */
const cleanDetail = (detail: string | null | undefined): string =>
  (detail ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);

export type Failure = {
  status: number;
  /** Stable code for the log line: `already_linked`, `exchange_failed:<code>`. */
  reason: string;
  body: Record<string, string>;
  /** The ONE line a route logs. */
  line: string;
};

export function failure(route: PlaidRoute, kind: FailureKind, detail?: string | null): Failure {
  const spec = SPEC[kind];
  const suffix = DETAILED.has(kind) ? cleanDetail(detail) : '';
  const reason = suffix ? `${kind}:${suffix}` : kind;
  const body: Record<string, string> = { error: spec.error };
  if (kind === 'already_linked') body.message = DUPLICATE_LINK_MESSAGE;
  if (kind === 'unauthorized' && route === 'exchange') body.message = SIGN_IN_AGAIN_MESSAGE;
  return {
    status: spec.status,
    reason,
    body,
    line: `plaid ${route} ${spec.status} ${reason}`,
  };
}

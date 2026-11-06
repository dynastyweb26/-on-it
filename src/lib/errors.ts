// One place that turns any error into what the user should read next.
// The raw error is logged, never rendered. Every cause gets its own sentence:
// offline / signed out / rate limit / too large / unsupported file /
// duplicate / bad input / not found / our end.
export type ErrorKind =
  | 'offline' | 'signed_out' | 'rate_limit' | 'too_large' | 'unsupported'
  | 'duplicate' | 'bad_input' | 'not_found' | 'our_end';

export const ERROR_MESSAGE: Record<ErrorKind, string> = {
  offline: 'No connection. Check your signal and try again.',
  signed_out: "You've been signed out. Sign in again to keep going.",
  rate_limit: "You've hit the limit for now. Try again a little later.",
  too_large: 'That file is too big. Try a smaller one.',
  unsupported: "That file type can't be read. Send a photo instead.",
  duplicate: 'That name is already taken. Use a different one.',
  bad_input: "Something doesn't look right. Check the highlighted field and try again.",
  not_found: "We couldn't find that. It may have been deleted.",
  our_end: 'Something broke on our end, not yours. Try again in a minute.',
};

/** Browser-level permission denial (share sheet, camera, clipboard). */
export const PERMISSION_BLOCKED_MESSAGE = 'Your browser blocked that. Allow it and try again.';
export const CAMERA_PERMISSION_MESSAGE = 'On It needs camera access. Allow it in your browser settings and try again.';

type Errorish = {
  status?: number | string | null;
  code?: string | number | null;
  message?: string | null;
  name?: string | null;
  hint?: string | null;
  details?: string | null;
};

function asErrorish(error: unknown): Errorish {
  if (!error || typeof error !== 'object') return {};
  return error as Errorish;
}

/** True for a browser permission rejection (share, camera, clipboard). */
export function isPermissionDenied(error: unknown): boolean {
  const name = asErrorish(error).name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

function matches(text: string | null | undefined, re: RegExp): boolean {
  return typeof text === 'string' && re.test(text);
}

// Postgres 42xxx is a query/constraint/schema mismatch, not a user's field
// value; PGRST20x is PostgREST's schema-cache miss for the same reason.
const SCHEMA_FAULT_CODE = /^(42\d{3}|PGRST20[0-5])$/;

/**
 * A constraint or schema fault: the query and the database disagree. These
 * often arrive as HTTP 400, so without this they read as "check the field".
 */
export function isSchemaFault(error: unknown): boolean {
  const e = asErrorish(error);
  const code = e.code == null ? '' : String(e.code);
  if (SCHEMA_FAULT_CODE.test(code)) return true;
  return matches(
    `${e.message ?? ''} ${e.details ?? ''}`,
    /no unique or exclusion constraint matching the "?on conflict"? specification|schema cache/i,
  );
}

export function classifyError(error: unknown): ErrorKind {
  // A live connection check wins: a fetch that failed while navigator says
  // offline is always the offline story, whatever the exception shape.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

  const e = asErrorish(error);
  const status = typeof e.status === 'string' ? Number(e.status) : e.status;
  const code = e.code == null ? '' : String(e.code);
  const message = e.message ?? '';

  if (e.name === 'AbortError') return 'our_end';
  if (matches(message, /failed to fetch|networkerror|network request failed|load failed|internet connection appears to be offline|err_internet_disconnected/i)) {
    return 'offline';
  }
  if (status === 401 || code === 'PGRST301' || code === '401' || matches(message, /jwt expired|invalid jwt|not authenticated|unauthorized|auth session missing|sign in again/i)) {
    return 'signed_out';
  }
  // Rate limited and day-capped ("that's today's voice limit") is a
  // try-again-later cause, never a failure of ours.
  if (status === 429 || code === '429' || matches(message, /rate limit|rate limited|too many|slow down|daily limit|voice limit|receipt limit|limit reached|hit the limit|resets tomorrow/i)) {
    return 'rate_limit';
  }
  // 413: the file was readable, just bigger than we accept.
  if (status === 413 || matches(message, /too large|too big|payload too large|file size/i)) {
    return 'too_large';
  }
  // 415: the file's type, not its size or contents.
  if (status === 415 || matches(message, /bad type|unsupported (media|file) ?type|isn't a (photo|file) i can read/i)) {
    return 'unsupported';
  }
  // A constraint/schema mismatch is ours, whatever the HTTP status says.
  if (isSchemaFault(e)) return 'our_end';
  // 23505 is a unique-name collision (a client, item or recurring vendor
  // already on file) — its own cause, because "check the field" misleads.
  if (code === '23505' || matches(message, /duplicate key|already exists|already have .*named/i)) {
    return 'duplicate';
  }
  if (status === 404 || code === 'PGRST116' || matches(message, /not found|no rows|0 rows|does not exist|couldn't find/i)) {
    return 'not_found';
  }
  if (
    status === 400 || status === 409 || status === 422
    || code === '23503' || code === '23502' || code === '23514'
    || code.startsWith('22') || code.startsWith('23')
    || e.name === 'ZodError'
    || matches(message, /invalid|validation|required|too short|too long|doesn't look right/i)
  ) {
    return 'bad_input';
  }
  // 5xx and anything unrecognised is ours.
  return 'our_end';
}

/** Log the raw error (never the user's copy), then return the sentence to show. */
export function userMessage(error: unknown, opts: { camera?: boolean } = {}): string {
  console.error('[user-error]', error);
  if (isPermissionDenied(error)) return opts.camera ? CAMERA_PERMISSION_MESSAGE : PERMISSION_BLOCKED_MESSAGE;
  return ERROR_MESSAGE[classifyError(error)];
}

/** Explicit offline copy without inventing an error object. */
export function offlineMessage(): string {
  return ERROR_MESSAGE.offline;
}

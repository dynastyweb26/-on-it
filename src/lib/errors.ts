// One place that turns any error into what the user should read next.
// The raw error is logged, never rendered. Five outcomes only:
// offline / signed out / bad input / not found / our end.
export type ErrorKind = 'offline' | 'signed_out' | 'bad_input' | 'not_found' | 'our_end';

export const ERROR_MESSAGE: Record<ErrorKind, string> = {
  offline: 'No connection. Check your signal and try again.',
  signed_out: "You've been signed out. Sign in again to keep going.",
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
  if (status === 404 || code === 'PGRST116' || matches(message, /not found|no rows|0 rows|does not exist|couldn't find/i)) {
    return 'not_found';
  }
  if (
    status === 400 || status === 409 || status === 422
    || code === '23505' || code === '23503' || code === '23502' || code === '23514'
    || code.startsWith('22') || code.startsWith('23')
    || e.name === 'ZodError'
    || matches(message, /invalid|validation|required|duplicate|already exists|too short|too long|doesn't look right/i)
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

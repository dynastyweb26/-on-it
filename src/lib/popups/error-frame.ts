// Every popup failure names its real cause — through lib/errors.ts, the one
// place that classifies offline / signed-out / rate-limit / our-end — and says
// what did NOT happen. This turns any thrown value into the three things the
// primitives draw: an icon, a short title, and a body that starts with the
// reassurance the caller supplies.
//
// The body always carries the errors.ts sentence too, so a new cause category
// can never render as a bare "Nothing was deleted." with no reason attached.
import type { IconName } from '@/components/icon-names';
import { classifyError, ERROR_MESSAGE, type ErrorKind } from '@/lib/errors';

export type PopupError = {
  kind: ErrorKind;
  icon: IconName;
  title: string;
  body: string;
};

/** Short titles: the body carries the full errors.ts sentence. */
export const ERROR_TITLE: Record<ErrorKind, string> = {
  offline: 'You’re offline',
  signed_out: 'You’ve been signed out',
  rate_limit: 'You’ve hit the limit',
  too_large: 'That file is too big',
  unsupported: 'That file can’t be read',
  duplicate: 'That name is already taken',
  bad_input: 'That didn’t look right',
  not_found: 'It’s already gone',
  our_end: 'It broke on our end',
};

/** The subset's closest glyph for each cause (IconName is a closed list). */
const ERROR_ICON: Record<ErrorKind, IconName> = {
  offline: 'sync_problem',
  signed_out: 'lock',
  rate_limit: 'schedule',
  too_large: 'warning',
  unsupported: 'block',
  duplicate: 'content_copy',
  bad_input: 'error_outline',
  not_found: 'error_outline',
  our_end: 'error',
};

/**
 * @param notDone what the failed action did not do ("Nothing was deleted.",
 *                "INV-0007 wasn’t changed."). Required for a write.
 */
export function popupError(error: unknown, opts: { notDone?: string } = {}): PopupError {
  const kind = classifyError(error);
  const cause = ERROR_MESSAGE[kind];
  return {
    kind,
    icon: ERROR_ICON[kind],
    title: ERROR_TITLE[kind],
    body: opts.notDone ? `${opts.notDone} ${cause}` : cause,
  };
}

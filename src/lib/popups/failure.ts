// Every popup failure names its real cause through src/lib/errors.ts, never by
// printing the exception. This adds the two things a popup needs on top of that
// sentence: a short title above it, and an icon.
import { classifyError, userMessage, type ErrorKind } from '../errors';
import type { IconName } from '@/components/icon-names';

export interface PopupFailure {
  /** The cause, so a caller can word a repeat failure for that cause. */
  kind: ErrorKind;
  title: string;
  body: string;
  icon: IconName;
}

export const ERROR_TITLE: Record<ErrorKind, string> = {
  offline: "You're offline",
  signed_out: "You're signed out",
  rate_limit: "That's the limit for now",
  too_large: 'That file is too big',
  unsupported: "That file can't be read",
  duplicate: 'That name is taken',
  bad_input: 'Check that field',
  not_found: "That's gone",
  our_end: 'Something broke on our end',
};

export const ERROR_ICON: Record<ErrorKind, IconName> = {
  offline: 'sync_problem',
  signed_out: 'lock',
  rate_limit: 'schedule',
  too_large: 'attach_file',
  unsupported: 'image',
  duplicate: 'content_copy',
  bad_input: 'edit',
  not_found: 'search',
  our_end: 'error',
};

/**
 * @param consequence what did NOT happen, in the caller's words
 *                    ("Nothing was deleted."). Prepended to the cause sentence.
 */
/**
 * A cause the caller names itself, for a documented state the classifier would
 * otherwise read as a fault: a 409 on a deactivate means the estimate is
 * already signed or converted, so nothing broke and a retry cannot work.
 * The sentence is still ours, never the exception's.
 */
export class PopupCauseError extends Error {
  readonly copy: { cause: string; title?: string; icon?: IconName };
  constructor(copy: { cause: string; title?: string; icon?: IconName }) {
    super(copy.cause);
    this.name = 'PopupCauseError';
    this.copy = copy;
  }
}

export function popupFailure(error: unknown, consequence?: string): PopupFailure {
  const kind = classifyError(error);
  // A named cause replaces the classifier's sentence, and skips its logging:
  // the state is known, not an exception.
  if (error instanceof PopupCauseError) {
    return {
      kind,
      title: error.copy.title ?? ERROR_TITLE[kind],
      body: consequence ? `${consequence} ${error.copy.cause}` : error.copy.cause,
      icon: error.copy.icon ?? ERROR_ICON[kind],
    };
  }
  // userMessage logs the raw error; only the sentence is ever rendered.
  const sentence = userMessage(error);
  return {
    kind,
    title: ERROR_TITLE[kind],
    body: consequence ? `${consequence} ${sentence}` : sentence,
    icon: ERROR_ICON[kind],
  };
}

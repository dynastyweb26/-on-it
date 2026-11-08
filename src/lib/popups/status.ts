// Pure copy for the limits and status round (Boards 5 and 6). No React.
// The guest wall never auto-redirects: the card says what happened, the draft
// stays put, and sign-in is a tap (board L2/L3/S5).

export type SignInKind = 'send' | 'expense' | 'voice' | 'receipt';

export type SignInCard = {
  eyebrow: string;
  title: string;
  text: string;
  signInLabel: string;
  signInBusy: string;
  /** What the second button does: just close the card, or fall back to typing. */
  secondary: 'dismiss' | 'type';
  secondaryLabel: string;
};

const SEND_HEADLINE = "Let's save your work — sign in to send this invoice.";
const EXPENSE_HEADLINE = "Let's save your work — sign in to keep this expense.";
const VOICE_HEADLINE = 'Create your free account to keep going.';

/** `headline` is the server's own sentence when it sent one; it wins, because
 *  the server knows which cap was hit. */
export function signInCard(kind: SignInKind, headline?: string | null): SignInCard {
  const said = headline?.trim() || null;
  switch (kind) {
    case 'expense':
      return {
        eyebrow: 'Signed out',
        title: said ?? EXPENSE_HEADLINE,
        text: 'Your expense stays right here.',
        signInLabel: 'Sign in',
        signInBusy: 'Opening sign in…',
        secondary: 'dismiss',
        secondaryLabel: 'Keep editing',
      };
    case 'voice':
      return {
        eyebrow: 'Voice',
        title: said ?? VOICE_HEADLINE,
        text: 'Anything you said so far is kept.',
        signInLabel: 'Create free account',
        signInBusy: 'Opening…',
        secondary: 'type',
        secondaryLabel: 'Type instead',
      };
    case 'receipt':
      return {
        eyebrow: 'Sign in to continue',
        title: said ?? "Let's save your work — sign in to keep going.",
        text: 'Sign in, then add the receipt again.',
        signInLabel: 'Sign in',
        signInBusy: 'Opening sign in…',
        secondary: 'dismiss',
        secondaryLabel: 'Not now',
      };
    default:
      return {
        eyebrow: 'Sign in to send',
        title: said ?? SEND_HEADLINE,
        text: 'Your draft stays right here.',
        signInLabel: 'Sign in',
        signInBusy: 'Opening sign in…',
        secondary: 'dismiss',
        secondaryLabel: 'Keep editing',
      };
  }
}

/** P-82: unreadable totals. It no longer blames the user's phrasing. */
export const UNREADABLE_PRICES_TEXT = 'I couldn’t read these prices. Say each one again, like “Car wash $200”.';

/** P-67: the share sheet did not open. The developer error name goes to the
 *  log, never to the screen. */
export const SHARE_NOT_OPENED_TEXT =
  'Your phone didn’t open the share sheet. Your draft is safe. Tap send to try again.';

/** L1: while a purchase or a restore is in flight, nothing may close the wall
 *  (the ×, Escape and the scrim all do nothing). It reopens its own question
 *  otherwise: did the charge go through? */
export function paywallDismissible(inFlight: { busy: boolean; buying: boolean; restoring: boolean }): boolean {
  return !(inFlight.busy || inFlight.buying || inFlight.restoring);
}

/** S3: an estimate send that failed with no connection says so. The status
 *  failures keep their own sentences. */
export const ESTIMATE_OFFLINE_TEXT = 'You’re offline — the estimate didn’t send. Your draft is safe.';

/** S7b: the cause line on a payment that needs attention. */
export function paymentAttentionText(reason?: string | null): string {
  const r = (reason ?? '').trim();
  return r ? `This payment could not be recorded. Reason: ${r}` : 'This payment could not be recorded.';
}

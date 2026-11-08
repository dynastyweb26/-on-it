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

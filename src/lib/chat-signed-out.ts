// Signed-out Chat. A guest who asks On It anything gets one short assistant
// message and a "Sign in" button inside the chat. Nothing else: no recap card
// of zeros, no "What I can do" card, no AI call, no half-working preview.
//
// Pure decisions only (no React, no network) so the states are unit-tested:
//   idle    the button waits for a tap
//   pending the tap started navigation; further taps are ignored
//   error   navigation never happened (3s); the button says so and can retry
//   repeat  a tap while pending changes nothing and navigates nothing

export const SIGNED_OUT_REPLY = "You're not signed in. Sign in and I'll pick this up where you left off.";
export const SIGN_IN_LABEL = 'Sign in';
export const SIGN_IN_BUSY = 'Opening sign in…';
export const SIGN_IN_ERROR = "Couldn't open sign in. Tap to try again.";
export const SIGN_IN_HREF = '/login';
/** How long a pending tap waits for the navigation before it reports an error. */
export const SIGN_IN_PENDING_MS = 3000;

/**
 * A genuine guest: the auth check has resolved and found no profile. Before it
 * resolves nobody is called a guest (a signed-in owner's first message must
 * never be answered with "not signed in"); the server's 401 is the backstop.
 */
export function isGuest(s: { profileLoaded: boolean; hasProfile: boolean }): boolean {
  return s.profileLoaded && !s.hasProfile;
}

export type SignedOutGate = { block: false } | { block: true; reply: string };

/** Should this send be answered with the sign-in message instead of anything else? */
export function signedOutGate(s: { guest: boolean }): SignedOutGate {
  return s.guest ? { block: true, reply: SIGNED_OUT_REPLY } : { block: false };
}

export type SignInState = 'idle' | 'pending' | 'error';
export type SignInEvent = 'tap' | 'timeout' | 'reset';

/** One step of the button. `navigate` is true only on the tap that starts it. */
export function signInStep(state: SignInState, event: SignInEvent): { state: SignInState; navigate: boolean } {
  if (event === 'reset') return { state: 'idle', navigate: false };
  if (event === 'timeout') return { state: state === 'pending' ? 'error' : state, navigate: false };
  // tap
  if (state === 'pending') return { state: 'pending', navigate: false };
  return { state: 'pending', navigate: true };
}

export function signInLabel(state: SignInState): string {
  return state === 'pending' ? SIGN_IN_BUSY : state === 'error' ? SIGN_IN_ERROR : SIGN_IN_LABEL;
}

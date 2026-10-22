/* ═══ First-sign-in camera tip ═══
   One auto-start path for coach marks: a signed-in user who has never seen the
   camera tip gets one step over the Chat camera button. Everything else about
   CoachMarks stays on demand. The gate is pure so every reason to wait (wrong
   route, another overlay, target not mounted) is unit-tested, and AppShell can
   re-check it while the app settles. */

/** The camera button in ChatView's composer. */
export const CAMERA_TUTORIAL_TARGET = '[data-coach="chat-camera"]';

export interface CameraTutorialGate {
  signedIn: boolean;
  /** null = never seen; a timestamp = already shown; undefined = unknown
   *  (profile/column not loaded yet, so never auto-start). */
  seenAt: string | null | undefined;
  path: string;
  coachOpen: boolean;
  overlayOpen: boolean;
  targetVisible: boolean;
}

export function canAutoStartCameraTutorial(gate: CameraTutorialGate): boolean {
  return gate.signedIn
    && gate.seenAt === null
    && gate.path === '/chat'
    && !gate.coachOpen
    && !gate.overlayOpen
    && gate.targetVisible;
}

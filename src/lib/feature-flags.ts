// App-wide switches for work that is built but not shipping yet.

// The first-sign-in camera walkthrough is built and its files/tests/migration
// stay in place, but the auto-start is vaulted until the decision is made.
export const ENABLE_CAMERA_ANIMATION = false; // Vaulted: decision pending.

// The in-app receipt camera (components/camera/ReceiptCamera.tsx), a
// getUserMedia full-screen capture screen. Default OFF: with the env var unset
// the composer camera button keeps using the OS photo input exactly as before,
// and the camera chunk is never requested. Inlined at build time, so turning it
// on is an env var plus a redeploy — never a runtime lookup.
export const IN_APP_CAMERA = process.env.NEXT_PUBLIC_IN_APP_CAMERA === 'true';

// AI Smart (Slice 0): the read-only tool loop behind POST /api/ask. Two gates,
// both required, so nothing turns on by accident — a build-time public flag (the
// same inlining as IN_APP_CAMERA above) and a server-side preview-only check (the
// same shape as bankTrackingForEnv below). Production never serves /api/ask, and
// neither does local development unless both gates are deliberately set.
export const AI_TOOLS = process.env.NEXT_PUBLIC_AI_TOOLS === 'true';

/** Preview-only, fails closed: production, local dev and an unset env are off. */
export function aiToolsForEnv(vercelEnv: string | undefined): boolean {
  return vercelEnv === 'preview';
}

/**
 * Bank tracking (mock phase 1: review stack, bank accounts, Expenses and
 * Books). SPEC.txt keeps it behind a flag and off in production. VERCEL_ENV is
 * read on the server in (app)/layout.tsx and passed down as a prop — the same
 * pattern as subscriptionsEnabled. Fails closed: only a Vercel *preview* build
 * turns the screens on, so production, local development and a missing or empty
 * VERCEL_ENV all stay dark. Pure, so it is unit-testable.
 */
export function bankTrackingForEnv(vercelEnv: string | undefined): boolean {
  return vercelEnv === 'preview';
}

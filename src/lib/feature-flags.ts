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

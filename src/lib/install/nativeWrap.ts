// Build-time switch for the native app wrapper. The wrapper ships as its own
// build with NEXT_PUBLIC_NATIVE_WRAP=true; when on, every PWA install prompt
// (banner, /install route, Home Screen hints) is suppressed. Off unless exactly
// "true", so the web/PWA build is unchanged.
export const NATIVE_WRAP = process.env.NEXT_PUBLIC_NATIVE_WRAP === 'true';

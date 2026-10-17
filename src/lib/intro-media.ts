// Welcome-screen media + auth-provider flags. One place to flip when the demo
// clip is exported or a provider goes live.
//
// Clip: 1080x2340 (9:19.5), 12-16 s loop, H.264, <=3 MB, no audio. Drop the
// files in /public/intro and set the two paths below. Until then the phone
// frame shows a branded placeholder.
export const INTRO_VIDEO_SRC: string | null = null;   // e.g. '/intro/demo.mp4'
export const INTRO_POSTER_SRC: string | null = null;  // e.g. '/intro/poster.jpg' (also the reduced-motion image)

// Providers stay hidden until they exist. Apple waits on the developer account;
// Google needs the provider configured AND OAuth code exchange in /auth/confirm.
export const AUTH_PROVIDERS = {
  apple: process.env.NEXT_PUBLIC_AUTH_APPLE === '1',
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === '1',
};
export const ANY_PROVIDER = AUTH_PROVIDERS.apple || AUTH_PROVIDERS.google;

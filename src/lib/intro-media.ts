// Welcome-screen media + auth-provider flags. One place to flip when the demo
// clip is exported or a provider goes live.
//
// Clip: 720x1222, 16 s loop, H.264, ~1.4 MB, no audio. The iPhone frame is baked
// into the clip and its background is the page cream (#fff8f0). Files live in
// /public/intro; swap them and update INTRO_ASPECT if the dimensions change.
export const INTRO_VIDEO_SRC: string | null = '/intro/demo.mp4';
export const INTRO_POSTER_SRC: string | null = '/intro/poster.jpg'; // also the reduced-motion image
export const INTRO_ASPECT = '720 / 1222';

// Providers stay hidden until they exist. Apple waits on the developer account;
// Google needs the provider configured AND OAuth code exchange in /auth/confirm.
export const AUTH_PROVIDERS = {
  apple: process.env.NEXT_PUBLIC_AUTH_APPLE === '1',
  google: process.env.NEXT_PUBLIC_AUTH_GOOGLE === '1',
};
export const ANY_PROVIDER = AUTH_PROVIDERS.apple || AUTH_PROVIDERS.google;

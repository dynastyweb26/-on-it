// Shared install-platform detection. Used by the /install page and the install
// banner so the "can this device install, and how" logic lives in one place.
// These read `navigator`, so only call them on the client (after mount).

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as MacIntel; touch points disambiguate it from a Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isIOSSafari(): boolean {
  return (
    isIOS() &&
    /Safari/.test(navigator.userAgent) &&
    // In-app / third-party iOS browsers can't install; only real Safari can.
    !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
  );
}

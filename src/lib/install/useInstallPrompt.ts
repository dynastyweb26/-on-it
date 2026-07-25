'use client';
import { useEffect, useState, useCallback } from 'react';

// Captures the deferred `beforeinstallprompt` event so the /install page can
// offer one-tap install (Android/Chrome). Also reports whether On It is already
// running as an installed PWA, so the page can skip the prompt entirely.
//
// Chrome only fires `beforeinstallprompt` when installability criteria are met
// (valid manifest + a registered service worker, over HTTPS). The install page
// registers /sw.js itself so this fires for fresh visitors who arrive straight
// from a QR scan or shared link and never opened the authed app.
//
// Timing: Chrome often fires the event before React hydrates, so the head script
// in the root layout captures it early onto `window.__deferredInstallPrompt`.
// On mount we adopt that stashed event if present, and also keep our own live
// listener for a late or repeat fire — both paths, so it works either way.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Set by the inline head script (src/app/layout.tsx) before React runs.
type InstallWindow = Window & { __deferredInstallPrompt?: BeforeInstallPromptEvent | null };

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already running as an installed PWA: standalone display, or iOS Safari's
    // legacy `navigator.standalone`.
    setIsInstalled(
      window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true,
    );

    // Adopt an event the head script already captured before we mounted.
    const early = (window as InstallWindow).__deferredInstallPrompt;
    if (early) setDeferred(early);

    const onPrompt = (e: Event) => {
      e.preventDefault(); // hold the event so we control when the prompt shows
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return null;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event is single-use: once shown, drop it so the button hides. Clear
    // the window stash too, so a remount can't re-adopt the spent event.
    if (outcome === 'accepted') {
      setDeferred(null);
      (window as InstallWindow).__deferredInstallPrompt = null;
    }
    return outcome;
  }, [deferred]);

  return { canPrompt: !!deferred, isInstalled, promptInstall };
}

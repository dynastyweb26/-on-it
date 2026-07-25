'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInstallPrompt } from '@/lib/install/useInstallPrompt';
import { isIOSSafari } from '@/lib/install/platform';
import Icon from '@/components/Icon';

// Slim, dismissible strip that invites the user to install On It. Rendered in the
// (app) layout as a flex sibling directly above the tab bar (not position:fixed),
// so it never overlaps the tab bar or the chat input on any tab.
//
// Shows only when ALL hold (after a client mount gate, to avoid hydration
// mismatch): not dismissed, not already installed, and install is actually
// possible here — Android/Chrome one-tap (canPrompt) or iOS Safari. Reuses
// useInstallPrompt and the shared platform helper; no duplicated logic.

const DISMISSED_KEY = 'onit_install_banner_dismissed';

export default function InstallBanner() {
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) setDismissed(true);
    } catch {
      /* localStorage unavailable (private mode etc.) — just show the banner */
    }
    setIosSafari(isIOSSafari());
    setMounted(true);

    // Once installed, persist the flag so the banner never returns on later loads
    // (isInstalled alone only hides it while the app runs standalone).
    const onInstalled = () => {
      try {
        localStorage.setItem(DISMISSED_KEY, '1');
      } catch {
        /* ignore */
      }
      setDismissed(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  const canInstallHere = canPrompt || iosSafari;
  if (!mounted || dismissed || isInstalled || !canInstallHere) return null;

  return (
    <div className="shrink-0 border-t border-outline-variant/50 bg-surface-container-low px-container py-2.5">
      <div className="flex items-center gap-3">
        <Icon name="install_mobile" size={24} className="shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-body-md text-on-background">
          {canPrompt ? 'Install On It for faster access.' : 'Add On It to your home screen.'}
        </p>

        {/* Slim on-token action: gold FILL, dark text (never white on gold),
            pill. Shorter than the 56px .btn-primary so it fits a strip. */}
        {canPrompt ? (
          <button
            onClick={() => promptInstall()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95"
          >
            Install
          </button>
        ) : (
          <Link
            href="/install"
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95"
          >
            Show how
          </Link>
        )}

        <button
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-on-surface-variant transition active:scale-90"
        >
          <Icon name="close" size={20} />
        </button>
      </div>
    </div>
  );
}

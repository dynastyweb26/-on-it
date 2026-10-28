'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInstallPrompt } from '@/lib/install/useInstallPrompt';
import { isIOSSafari } from '@/lib/install/platform';
import Icon from '@/components/Icon';

// Dismissible install prompt in the tablet / desktop sidebar: an icon-only
// button in the md rail, a stacked card at lg+. The mobile bar strip was removed
// (chore: in-app install nudges); /install and its QR code remain the way in.
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

  const label = canPrompt ? 'Install On It' : 'Show how to add On It';
  const railButton = 'grid h-11 w-11 place-items-center rounded-2xl bg-primary-container text-on-background transition active:scale-95 lg:hidden';
  const cardButton = 'inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-button bg-primary-container px-4 text-label-lg font-semibold text-on-background transition active:scale-95';
  return (
    <div data-kb-hide="" className="flex flex-col items-center lg:block">
      {/* md rail: just the icon (80px has no room for words). */}
      {canPrompt ? (
        <button onClick={() => promptInstall()} aria-label={label} title={label} className={railButton}>
          <Icon name="install_mobile" size={22} />
        </button>
      ) : (
        <Link href="/install" aria-label={label} title={label} className={railButton}>
          <Icon name="install_mobile" size={22} />
        </Link>
      )}
      {/* lg+: a card in the 288px sidebar: message on top, actions below.
          xl: the design's compact card — one 13px block of text on two lines
          beside the icon, the Install pill under it, no wrapping (the old card
          broke this sentence one word per line in the narrow column). */}
      <div className="hidden rounded-2xl border border-outline-variant/50 bg-surface-container p-4 lg:block xl:rounded-card xl:border-outline-variant/35 xl:bg-surface-container-lowest xl:p-3.5">
        <div className="flex items-start gap-3">
          <Icon name="install_mobile" size={24} className="mt-0.5 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 text-body-md text-on-background xl:text-[13px] xl:leading-[1.35]">
            {canPrompt ? 'Install On It for faster access.' : 'Add On It to your home screen.'}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2 xl:mt-2.5">
          {canPrompt ? (
            <button onClick={() => promptInstall()} className={`${cardButton} xl:h-8 xl:flex-none xl:whitespace-nowrap xl:px-3 xl:text-[13px]`}>Install</button>
          ) : (
            <Link href="/install" className={`${cardButton} xl:h-8 xl:flex-none xl:whitespace-nowrap xl:px-3 xl:text-[13px]`}>Show how</Link>
          )}
          <button
            onClick={dismiss}
            aria-label="Dismiss install banner"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface-variant transition active:scale-90 xl:h-8 xl:w-8"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

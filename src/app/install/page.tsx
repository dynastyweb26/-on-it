'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useInstallPrompt } from '@/lib/install/useInstallPrompt';
import Icon from '@/components/Icon';

// Public, chrome-less distribution route (deliberately outside the (app) group,
// so no tab bar / auth chrome). Meantime install path while On It is outside the
// app stores. Styling comes entirely from the Warm Premium tokens in
// tailwind.config.ts — no hardcoded palette here.

// On-background token value (#1f1b13). QRCodeSVG needs the module color as a
// prop string, so this one literal mirrors the `on-background` token.
const QR_INK = '#1f1b13';

function isIOS() {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as MacIntel; touch points disambiguate it from a Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
function isIOSSafari() {
  return (
    isIOS() &&
    /Safari/.test(navigator.userAgent) &&
    // In-app / third-party iOS browsers can't install; only real Safari can.
    !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)
  );
}

export default function InstallPage() {
  const { canPrompt, isInstalled, promptInstall } = useInstallPrompt();

  // Platform detection touches `navigator`, so it can only run in the browser.
  // We resolve it after mount and gate the decision block on `mounted` so the
  // server-rendered markup and the first client render match (no hydration
  // mismatch, no flash of the wrong branch).
  const [mounted, setMounted] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [iosOther, setIosOther] = useState(false);
  // The QR points a desktop viewer back to this same page on their phone. Use
  // the current origin (resolved on the client) so it works on the preview
  // deployment and production alike, not a hardcoded host.
  const [installUrl, setInstallUrl] = useState('');

  useEffect(() => {
    // Register the existing service worker so Chrome's installability criteria
    // are met for fresh visitors who land here straight from a QR scan or shared
    // link (they may never have opened the authed app, where /sw.js is otherwise
    // registered). Does not modify sw.js or the manifest.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const ios = isIOS();
    const safari = isIOSSafari();
    setIosSafari(ios && safari);
    setIosOther(ios && !safari);
    setInstallUrl(window.location.origin + '/install');
    setMounted(true);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center px-container py-12 text-center">
      <h1 className="mb-2 font-display text-display-md font-extrabold text-primary">
        Get On It on your phone
      </h1>
      <p className="mb-8 max-w-sm text-body-md text-on-surface-variant">
        Add On It to your home screen. No app store, no download — it opens like a normal app.
      </p>

      {mounted && isInstalled && (
        <div className="flex flex-col items-center gap-2">
          <Icon name="check_circle" size={48} className="text-primary" />
          <p className="text-body-md text-on-background">You&apos;re all set. On It is already installed.</p>
        </div>
      )}

      {mounted && !isInstalled && canPrompt && (
        <button onClick={promptInstall} className="btn-primary text-lg">
          <Icon name="install_mobile" size={24} />
          Install On It
        </button>
      )}

      {mounted && !isInstalled && !canPrompt && iosSafari && (
        <ol className="max-w-xs space-y-4 text-left text-body-md text-on-background">
          <li className="flex gap-3">
            <Icon name="ios_share" size={24} className="shrink-0 text-primary" />
            <span>Tap the <strong>Share</strong> button at the bottom of Safari.</span>
          </li>
          <li className="flex gap-3">
            <Icon name="add_to_home_screen" size={24} className="shrink-0 text-primary" />
            <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
          </li>
          <li className="flex gap-3">
            <Icon name="check_circle" size={24} className="shrink-0 text-primary" />
            <span>Tap <strong>Add</strong>. On It lands on your home screen.</span>
          </li>
        </ol>
      )}

      {mounted && !isInstalled && !canPrompt && iosOther && (
        <div className="max-w-xs text-on-background">
          <Icon name="open_in_new" size={40} className="text-primary" />
          <p className="mt-2 text-body-md">
            On iPhone, installing only works in <strong>Safari</strong>. Open this page in Safari,
            then come back here.
          </p>
        </div>
      )}

      {mounted && !isInstalled && !canPrompt && !iosSafari && !iosOther && (
        <div className="flex flex-col items-center gap-4">
          <p className="text-body-md text-on-background">Scan this with your phone to install:</p>
          <div className="rounded-card bg-surface-container-lowest p-4">
            <QRCodeSVG value={installUrl} size={180} fgColor={QR_INK} />
          </div>
        </div>
      )}
    </main>
  );
}

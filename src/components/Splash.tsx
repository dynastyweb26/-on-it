'use client';
// Splash (Design Standard §10, white-icon spec): cream page, the shipped
// white/gold thumbs-up icon centered with a thin outline-variant ring +
// soft warm shadow so its white edge doesn't vanish into the page. No
// separate wordmark — "ON IT!" is baked into the icon art. Brief hold,
// then dissolve into the app. Fade/scale only; once per session.
import { useEffect, useState } from 'react';

export default function Splash() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('onit_splash_shown')) return;
      sessionStorage.setItem('onit_splash_shown', '1');
    } catch {
      return; // storage blocked — skip the splash rather than replay it forever
    }
    setShow(true);
    const fade = setTimeout(() => setLeaving(true), 1100);
    const gone = setTimeout(() => setShow(false), 1500);
    return () => { clearTimeout(fade); clearTimeout(gone); };
  }, []);

  if (!show) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#fff8f0',
        display: 'grid', placeItems: 'center',
        opacity: leaving ? 0 : 1, transition: 'opacity 380ms ease',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-180.png"
        alt=""
        width={128}
        height={128}
        style={{
          borderRadius: 28,
          border: '1px solid #d0c5af',
          boxShadow: '0 8px 32px rgba(115, 92, 0, 0.10)',
          animation: 'splash-in 420ms ease-out',
        }}
      />
    </div>
  );
}

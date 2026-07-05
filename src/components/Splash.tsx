'use client';
// Splash: the app icon draws itself — gold circle strokes in, checkmark
// draws inside — then fades into the app. Pure SVG/CSS, once per session.
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
    const fade = setTimeout(() => setLeaving(true), 1200);
    const gone = setTimeout(() => setShow(false), 1550);
    return () => { clearTimeout(fade); clearTimeout(gone); };
  }, []);

  if (!show) return null;
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#FCFAF6',
        display: 'grid', placeItems: 'center',
        opacity: leaving ? 0 : 1, transition: 'opacity 350ms ease',
      }}
    >
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle
          className="splash-draw"
          cx="60" cy="60" r="50" fill="none" stroke="#D4A017" strokeWidth="7"
          strokeLinecap="round" strokeDasharray="314.16" strokeDashoffset="314.16"
          transform="rotate(-90 60 60)"
          style={{ animation: 'onit-draw 0.6s ease-out forwards' }}
        />
        <path
          className="splash-draw"
          d="M38 62 L54 78 L84 46" fill="none" stroke="#D4A017" strokeWidth="8"
          strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="67" strokeDashoffset="67"
          style={{ animation: 'onit-draw 0.45s ease-out 0.55s forwards' }}
        />
      </svg>
    </div>
  );
}

'use client';
// Splash — the brand logo reveal, once per session on the first cold start.
//
// Three gold arcs converge and lock into the ring, then the rings turn white as
// the icon-gradient tile scales in behind them (motion + timings: globals.css,
// "Splash: brand logo reveal"). The markup is server-rendered and the motion is
// pure CSS, so it plays from the first painted frame, before hydration; this
// component only decides when it LEAVES.
//
// Visibility is decided before first paint by the head script in layout.tsx:
// it sets html[data-splash] only on the session's first cold start (sessionStorage
// `onit_splash_shown`; storage blocked → no splash rather than one every load).
// No attribute → the markup stays display:none and is dropped on hydration.
//
// The app renders UNDERNEATH from the first frame — never gate {children} on
// this. Exit = reveal finished AND the screen is ready (lib/splash-gate), capped
// at READY_CAP_MS after the reveal so a slow network can't trap the user; if
// JS never arrives, a CSS failsafe dissolves it at 6s.
import { useEffect, useRef, useState } from 'react';
import { RING_A, RING_B, RING_CLIP } from '@/components/splash/ring-paths';
import { whenAppReady } from '@/lib/splash-gate';

const REVEAL_MS = 850; // the mark locks at 800ms; the exit may start from here
const READY_CAP_MS = 2500; // longest we wait for the screen after the reveal
const FAILSAFE_MS = 6000; // matches the CSS failsafe delay in globals.css
const EXIT_MS = 380;
const EXIT_REDUCED_MS = 150;

declare global {
  interface Window { __onitSplashT0?: number }
}

export default function Splash() {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const finish = () => {
      html.removeAttribute('data-splash');
      setDone(true);
    };
    if (!html.hasAttribute('data-splash')) { setDone(true); return; }

    const elapsed = performance.now() - (window.__onitSplashT0 ?? 0);
    // Hydrated after the CSS failsafe already dissolved it: just clean up.
    if (elapsed >= FAILSAFE_MS) { finish(); return; }
    // Take over from the CSS failsafe (it only applies to data-splash="").
    html.setAttribute('data-splash', 'live');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let revealed = false;
    let ready = false;
    let exited = false;
    let unsubscribe = () => {};

    const exit = () => {
      if (exited) return;
      exited = true;
      const el = ref.current;
      if (!el || typeof el.animate !== 'function') { finish(); return; }
      el.style.pointerEvents = 'none'; // early taps reach the app from here on
      // Unmount on the Web Animation's `finished`, NOT on transitionend or a
      // setTimeout mirroring a CSS duration. Regression note: globals.css kills
      // every CSS transition/animation under prefers-reduced-motion, so a
      // transitionend-based exit never fires there and the splash is stuck
      // forever. WAAPI animations aren't affected by that rule.
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduced ? EXIT_REDUCED_MS : EXIT_MS,
        easing: 'ease',
        fill: 'forwards',
      }).finished.then(finish, finish);
    };
    const maybeExit = () => { if (revealed && ready) exit(); };

    const revealLeft = Math.max(0, (reduced ? 0 : REVEAL_MS) - elapsed);
    const revealTimer = setTimeout(() => { revealed = true; maybeExit(); }, revealLeft);
    const capTimer = setTimeout(exit, revealLeft + READY_CAP_MS);
    // Screens register their holds in their own mount effects, which run after
    // this one (this component is an earlier sibling), so subscribe a tick later.
    const subscribeTimer = setTimeout(() => {
      unsubscribe = whenAppReady(() => { ready = true; maybeExit(); });
    }, 0);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(capTimer);
      clearTimeout(subscribeTimer);
      unsubscribe();
    };
  }, []);

  if (done) return null;
  return (
    <div ref={ref} className="onit-splash" aria-hidden>
      <div className="onit-splash-backdrop" />
      <div className="onit-splash-mark">
        {/* Gold rounded tile, radius 22% of the mark box — the app icon's own
            gradient, not the export's flat #d4af37, so the mark matches the OS
            icon it came from. */}
        <svg className="onit-splash-layer onit-splash-tile" viewBox="0 0 1024 1024">
          <rect width="1024" height="1024" rx="225.28" fill="url(#onit-splash-grad)" />
        </svg>
        {/* The three converging arcs (export PIECES): the joined left arcs split
            by the clip into inner + outer pieces, then the right arc. Only
            used while converging — see the whole mark below. */}
        <div className="onit-splash-layer onit-splash-arcs">
          <svg className="onit-splash-layer onit-splash-arc onit-splash-arc-1" viewBox="0 0 1024 1024">
            <g clipPath="url(#onit-splash-clip-in)"><use href="#onit-splash-ring-b" /></g>
          </svg>
          <svg className="onit-splash-layer onit-splash-arc onit-splash-arc-2" viewBox="0 0 1024 1024">
            <g clipPath="url(#onit-splash-clip-out)"><use href="#onit-splash-ring-b" /></g>
          </svg>
          <svg className="onit-splash-layer onit-splash-arc onit-splash-arc-3" viewBox="0 0 1024 1024">
            <use href="#onit-splash-ring-a" />
          </svg>
        </div>
        {/* The locked mark as ONE unsplit shape (same path data via <use>).
            Swapped in for the arcs the instant they lock, so the resting mark
            is exactly the icon: two complementary clips, each anti-aliased,
            leave a faint hairline where the split crosses the white arc. */}
        <svg className="onit-splash-layer onit-splash-whole" viewBox="0 0 1024 1024">
          <use href="#onit-splash-ring-a" />
          <use href="#onit-splash-ring-b" />
        </svg>
      </div>
      <svg className="onit-splash-defs" aria-hidden focusable="false">
        <defs>
          <linearGradient id="onit-splash-grad" x1="0" y1="724.084" x2="724.084" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0.2" stopColor="#B8860B" />
            <stop offset="0.302885" stopColor="#D4A017" />
            <stop offset="1" stopColor="#B8860B" />
          </linearGradient>
          <path id="onit-splash-ring-a" d={RING_A} />
          <path id="onit-splash-ring-b" d={RING_B} />
          <clipPath id="onit-splash-clip-in"><path d={RING_CLIP} /></clipPath>
          <clipPath id="onit-splash-clip-out">
            <path d={`M-400 -400H1424V1424H-400Z${RING_CLIP}`} clipRule="evenodd" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

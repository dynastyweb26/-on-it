'use client';
// Full-screen "You're on On It Pro" celebration (direction C, "Swoosh").
//
// Plays once, over whatever screen the user is on, when the unlock poll sees the
// paid tier arrive (lib/upgrade-return.ts: a Stripe Checkout return or a
// redeemed code). Mounted once in the (app) layout. Tap anywhere to dismiss.
//
// Timeline (ms, 3000 total): scrim fades in 0-360 · gold tile scales in 120-560
// · white swoosh wipes across it 360-1000 · light sweeps the tile 980-1600 ·
// shockwave 1000-2000 · gold confetti fires from both bottom corners 1020-3020
// · headline rises 1080-1700 · subline rises 1220-1780 · everything fades out
// 2550-3000. Reduced motion: a still card fades in (240) and out (2000-2300).
//
// WAAPI + canvas rather than CSS keyframes: the global reduced-motion kill
// switch in globals.css does not reach WAAPI, so this component owns its own
// reduced path (usePrefersReducedMotion).

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAccess } from '@/lib/upgrade-return';
import { isPaidTier } from '@/lib/paywall';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

const E = {
  out: 'cubic-bezier(.22,1,.36,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  exit: 'cubic-bezier(.4,0,1,1)',
};
const fadeUp = (dy: number): Keyframe[] => [
  { opacity: 0, transform: `translateY(${dy}px)` },
  { opacity: 1, transform: 'translateY(0)' },
];
const SOFT: Keyframe[] = [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }];
const WAVE: Keyframe[] = [{ transform: 'scale(1)', opacity: 0.55 }, { transform: 'scale(3.4)', opacity: 0 }];
const GLINT: Keyframe[] = [
  { transform: 'translateX(-160%) rotate(20deg)' },
  { transform: 'translateX(330%) rotate(20deg)' },
];
const WIPE: Keyframe[] = [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }];
const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const EXIT: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];
const SETTLE: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(.97)' }];
const SHOW: Keyframe[] = [{ opacity: 1, transform: 'none' }, { opacity: 1, transform: 'none' }];

type Beat = { el: string; start: number; dur: number; ease: string; kf: Keyframe[] };

const FULL_TOTAL = 3000;
const FULL: Beat[] = [
  { el: 'scrim', start: 0, dur: 360, ease: E.out, kf: FADE },
  { el: 'tile', start: 120, dur: 440, ease: E.out, kf: SOFT },
  { el: 'swoosh', start: 360, dur: 640, ease: E.inOut, kf: WIPE },
  { el: 'glint', start: 980, dur: 620, ease: E.inOut, kf: GLINT },
  { el: 'wave', start: 1000, dur: 1000, ease: E.out, kf: WAVE },
  { el: 'head', start: 1080, dur: 620, ease: E.out, kf: fadeUp(18) },
  { el: 'sub', start: 1220, dur: 560, ease: E.out, kf: fadeUp(12) },
  { el: 'fade', start: 2550, dur: 450, ease: E.exit, kf: EXIT },
  { el: 'content', start: 2550, dur: 450, ease: E.exit, kf: SETTLE },
];
const CONFETTI_START = 1020;

const REDUCED_TOTAL = 2300;
const REDUCED: Beat[] = [
  { el: 'scrim', start: 0, dur: 240, ease: 'ease-out', kf: FADE },
  { el: 'content', start: 0, dur: 240, ease: 'ease-out', kf: FADE },
  { el: 'tile', start: 0, dur: 1, ease: 'linear', kf: SHOW },
  { el: 'head', start: 0, dur: 1, ease: 'linear', kf: SHOW },
  { el: 'sub', start: 0, dur: 1, ease: 'linear', kf: SHOW },
  { el: 'swoosh', start: 0, dur: 1, ease: 'linear', kf: [{ clipPath: 'inset(0)' }, { clipPath: 'inset(0)' }] },
  { el: 'fade', start: 2000, dur: 300, ease: 'ease-in', kf: EXIT },
];

const DARK: [number, number, number] = [168, 132, 31];
const BASE: [number, number, number] = [212, 175, 55];
const LIGHT: [number, number, number] = [251, 233, 166];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

type Piece = {
  type: 'square' | 'ribbon' | 'glint';
  age: number; delay: number; life: number;
  rot: number; vr: number; tilt: number; vt: number;
  swayF: number; swayA: number;
  w: number; h: number; s: number; tw: number;
  drag: number; g: number; term: number;
  x: number; y: number; vx: number; vy: number;
};

/** Gold confetti from both bottom corners, aimed 10-35 degrees off vertical
 *  toward the centre. dt-scaled physics so 60 Hz and 120 Hz look identical.
 *  Returns a cancel function. */
function fireConfetti(cv: HTMLCanvasElement, root: HTMLElement): () => void {
  const W = root.clientWidth, H = root.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) return () => undefined;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const k = Math.min(1.6, Math.max(1, W / 390)), sk = Math.sqrt(k);
  const N = 36, R = Math.random, P: Piece[] = [];
  const nG = Math.round(N * 0.18);
  for (let i = 0; i < N; i++) {
    const type: Piece['type'] = i < nG ? 'glint' : (R() < 0.5 ? 'square' : 'ribbon');
    const p: Piece = {
      type, age: 0, delay: R() * 140, life: 2000 + R() * 500,
      rot: R() * 6.28, vr: (R() - 0.5) * 0.22, tilt: R() * 6.28, vt: 0.07 + R() * 0.16,
      swayF: 0.004 + R() * 0.004, swayA: 0, w: 0, h: 0, s: 0, tw: 0,
      drag: 0, g: 0, term: 0, x: 0, y: 0, vx: 0, vy: 0,
    };
    if (type === 'square') {
      const s = (5 + R() * 6) * k; p.w = s; p.h = s * (0.8 + R() * 0.4);
      p.drag = 0.975; p.g = 0.2; p.term = 4.2; p.swayA = 0.3;
    } else if (type === 'ribbon') {
      p.w = (2.2 + R() * 1.4) * k; p.h = (12 + R() * 12) * k;
      p.drag = 0.962; p.g = 0.17; p.term = 3.2; p.swayA = 0.9; p.vr = (R() - 0.5) * 0.12;
    } else {
      p.s = (5 + R() * 6) * k; p.drag = 0.94; p.g = 0.035; p.term = 1.2; p.swayA = 0.2;
      p.tw = 0.006 + R() * 0.006; p.vr = (R() - 0.5) * 0.03;
    }
    const left = i % 2 === 0;
    const a = -Math.PI / 2 + (left ? 1 : -1) * (0.18 + R() * 0.42);
    const v = (10 + R() * 7) * sk * (type === 'glint' ? 0.7 : 1);
    p.x = left ? -6 : W + 6; p.y = H * 0.82;
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
    P.push(p);
  }

  let raf = 0, last = performance.now(), stopped = false;
  const tick = (now: number) => {
    if (stopped) return;
    const dt = Math.min(3, (now - last) / 16.667), ms = dt * 16.667;
    last = now;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of P) {
      p.age += ms;
      if (p.age < p.delay) { alive++; continue; }
      const t = p.age - p.delay;
      if (t > p.life) continue;
      alive++;
      const d = Math.pow(p.drag, dt);
      p.vx *= d; p.vy = Math.min(p.vy * d + p.g * dt, p.term);
      p.x += p.vx * dt + Math.sin(t * p.swayF) * p.swayA * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt; p.tilt += p.vt * dt;
      const alpha = Math.max(0, Math.min(1, (p.life - t) / 450, t / 80));
      ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = alpha;
      if (p.type === 'glint') {
        const tw = Math.max(0, Math.sin(t * p.tw)), s = p.s * (0.35 + 0.65 * tw);
        ctx.rotate(p.rot); ctx.globalAlpha = alpha * (0.25 + 0.75 * tw);
        ctx.fillStyle = 'rgb(201,162,47)'; ctx.beginPath();
        ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s); ctx.fill();
        ctx.fillStyle = '#fffdf6'; ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, 6.283); ctx.fill();
      } else {
        // Each piece tumbles; the colour flips toward dark on its back side and
        // flashes light when it faces the "sun" (cos^4), which reads as glitter.
        const c = Math.cos(p.tilt), light = Math.pow(Math.max(0, c), 4), dark = Math.max(0, -c) * 0.8;
        const col = light > 0 ? mix(BASE, LIGHT, light) : mix(BASE, DARK, dark);
        ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        if (p.type === 'square') { ctx.rotate(p.rot); ctx.scale(1, c || 0.01); }
        else { ctx.rotate(p.rot + Math.sin(t * 0.01) * 0.4); ctx.scale(c || 0.01, 1); }
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, W, H);
  };
  raf = requestAnimationFrame(tick);
  return () => { stopped = true; cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); };
}

export default function ProCelebration() {
  const reduced = usePrefersReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const dismissing = useRef(false);

  const rRoot = useRef<HTMLDivElement>(null);
  const rFade = useRef<HTMLDivElement>(null);
  const rScrim = useRef<HTMLDivElement>(null);
  const rCanvas = useRef<HTMLCanvasElement>(null);
  const rContent = useRef<HTMLDivElement>(null);
  const rTile = useRef<HTMLDivElement>(null);
  const rSwoosh = useRef<HTMLImageElement>(null);
  const rGlint = useRef<HTMLDivElement>(null);
  const rWave = useRef<HTMLDivElement>(null);
  const rHead = useRef<HTMLHeadingElement>(null);
  const rSub = useRef<HTMLParagraphElement>(null);

  const anims = useRef<Animation[]>([]);
  const timers = useRef<number[]>([]);
  const stopConfetti = useRef<(() => void) | null>(null);

  const stopAll = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    anims.current.forEach((a) => a.cancel()); anims.current = [];
    stopConfetti.current?.(); stopConfetti.current = null;
  }, []);

  const finish = useCallback(() => {
    stopAll();
    dismissing.current = false;
    activeRef.current = false;
    setActive(false);
  }, [stopAll]);

  const play = useCallback(() => {
    if (activeRef.current) return; // one at a time
    activeRef.current = true;
    setActive(true);
  }, []);

  // Start the beats once the overlay is mounted and visible.
  useEffect(() => {
    if (!active) return;
    const els: Record<string, HTMLElement | null> = {
      scrim: rScrim.current, fade: rFade.current, content: rContent.current, tile: rTile.current,
      swoosh: rSwoosh.current, glint: rGlint.current, wave: rWave.current, head: rHead.current, sub: rSub.current,
    };
    const isReduced = reducedRef.current;
    const beats = isReduced ? REDUCED : FULL;
    const total = isReduced ? REDUCED_TOTAL : FULL_TOTAL;
    const raf = requestAnimationFrame(() => {
      for (const b of beats) {
        const el = els[b.el];
        if (!el) continue;
        const a = el.animate(b.kf, { delay: b.start, duration: b.dur, easing: b.ease, fill: 'both' });
        (a as Animation & { _el?: string })._el = b.el;
        anims.current.push(a);
      }
      if (!isReduced) {
        timers.current.push(window.setTimeout(() => {
          const cv = rCanvas.current, root = rRoot.current;
          if (cv && root) stopConfetti.current = fireConfetti(cv, root);
        }, CONFETTI_START));
      }
      timers.current.push(window.setTimeout(finish, total + 40));
    });
    return () => { cancelAnimationFrame(raf); stopAll(); };
  }, [active, finish, stopAll]);

  // Fire when the unlock poll sees a paid tier (Checkout return or redeemed code).
  // Ignores a "paid" read that is only the paywall being off (no tier change).
  useEffect(() => subscribeAccess((a) => { if (isPaidTier(a.tier)) play(); }), [play]);

  const dismiss = () => {
    if (!activeRef.current || dismissing.current) return;
    const f = rFade.current; if (!f) return;
    dismissing.current = true;
    const cur = getComputedStyle(f).opacity;
    timers.current.forEach(clearTimeout); timers.current = [];
    anims.current
      .filter((a) => (a as Animation & { _el?: string })._el === 'fade')
      .forEach((a) => a.cancel());
    const a = f.animate([{ opacity: cur }, { opacity: 0 }], { duration: 280, easing: E.exit, fill: 'both' });
    anims.current.push(a);
    a.onfinish = finish;
  };

  if (!active) return null;

  return (
    <div
      ref={rRoot}
      role="status"
      aria-live="polite"
      onClick={dismiss}
      className="fixed inset-0 z-[90] cursor-pointer overflow-hidden"
      style={{ containerType: 'size' }}
    >
      <div ref={rFade} className="absolute inset-0">
        <div
          ref={rScrim}
          aria-hidden
          className="absolute inset-0 opacity-0"
          style={{
            background:
              'radial-gradient(120% 70% at 50% 42%, rgba(255,246,228,.94) 0%, rgba(255,248,240,.82) 55%, rgba(250,240,226,.86) 100%)',
            backdropFilter: 'blur(18px) saturate(1.1)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.1)',
          }}
        />
        <canvas ref={rCanvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
        <div
          className="absolute inset-0 flex items-center justify-center text-center"
          style={{ padding: 'max(24px, env(safe-area-inset-top)) max(28px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(28px, env(safe-area-inset-left))' }}
        >
          <div ref={rContent} className="flex flex-col items-center" style={{ marginTop: '-7cqh' }}>
            <div className="relative aspect-square" style={{ width: 'clamp(96px, 27cqw, 136px)' }}>
              <div
                ref={rWave}
                aria-hidden
                className="absolute opacity-0"
                style={{ inset: '-4%', borderRadius: '30%', border: '2px solid #d4af37' }}
              />
              <div
                ref={rTile}
                aria-hidden
                className="absolute inset-0 overflow-hidden opacity-0"
                style={{
                  borderRadius: '26%',
                  background: 'linear-gradient(145deg,#f3d77e 0%,#d4af37 46%,#a8841f 100%)',
                  boxShadow:
                    '0 22px 44px -14px rgba(115,92,0,.5), 0 2px 6px rgba(115,92,0,.18), inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 0 rgba(0,0,0,.08)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={rSwoosh}
                  src="/recap/swoosh-gold.svg"
                  alt=""
                  draggable={false}
                  className="absolute object-contain"
                  style={{ inset: '20%', width: '60%', height: '60%', filter: 'brightness(0) invert(1)', clipPath: 'inset(0 100% 0 0)' }}
                />
                <div
                  ref={rGlint}
                  className="absolute"
                  style={{
                    top: '-50%', left: 0, width: '45%', height: '200%',
                    background: 'linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.6) 50%,rgba(255,255,255,0) 100%)',
                    transform: 'translateX(-160%) rotate(20deg)',
                  }}
                />
              </div>
            </div>
            <h1
              ref={rHead}
              className="font-display opacity-0"
              style={{
                margin: 'clamp(30px, 7.5cqw, 44px) 0 0',
                maxWidth: '11.5em',
                fontSize: 'clamp(30px, 8.2cqw, 52px)',
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                color: '#1c1a17',
                textWrap: 'balance',
              }}
            >
              The beginning of something great
            </h1>
            <p
              ref={rSub}
              className="font-body opacity-0"
              style={{
                margin: 'clamp(12px, 3cqw, 18px) 0 0',
                fontSize: 'clamp(15px, 3.9cqw, 19px)',
                fontWeight: 500,
                lineHeight: 1.4,
                color: '#735c00',
                letterSpacing: '.005em',
                whiteSpace: 'nowrap',
              }}
            >
              You&apos;re on <span style={{ fontWeight: 600 }}>On It Pro</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

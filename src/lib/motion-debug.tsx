'use client';
// TEMPORARY — receipt-motion diagnosis (MOTION-SPEC §8). REMOVE BEFORE MERGE.
//
// Logs animationstart / animationend / animationcancel for the receipt
// capture + save animations, as ms after the camera closed (the file input's
// change event), with whether the image had decoded and whether the element
// was on screen. Console: "[motion] …". On the phone: open /chat?motionlog=1
// and the log shows in a small panel (tap it to clear).
import { useEffect, useState } from 'react';

const WATCH = /^onit-(shutter|photo-in|card-in|card-out|receipt-bubble|logged|chip-in|rise)/;

export type MotionEntry = { t: number; event: string; detail: string };

const log: MotionEntry[] = [];
let t0 = 0;
let listeners: (() => void)[] = [];
const emit = () => listeners.forEach((f) => f());

function push(event: string, detail: string) {
  const t = t0 ? Math.round(performance.now() - t0) : -1;
  log.push({ t, event, detail });
  console.info('[motion]', `${t}ms`, event, detail);
  emit();
}

/** Call when the camera/gallery returns (the input's change event). */
export function markCameraClosed() {
  t0 = performance.now();
  log.length = 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  push('camera-closed', `reduced-motion=${reduced}`);
}

/** A milestone in the flow (prepared, draft shown, saved…). */
export function markMotion(event: string, detail = '') { push(event, detail); }

function describe(e: AnimationEvent): string {
  const el = e.target as HTMLElement;
  const img = (el.tagName === 'IMG' ? el : el.querySelector?.('img')) as HTMLImageElement | null;
  const r = el.getBoundingClientRect();
  const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
  const imgState = img ? ` img.complete=${img.complete} naturalWidth=${img.naturalWidth}` : '';
  return `${e.animationName} on-screen=${onScreen} top=${Math.round(r.top)}${imgState}`;
}

/** Mount once on the chat page. Returns nothing; the panel shows only with ?motionlog=1. */
export function MotionDebug() {
  const [, force] = useState(0);
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(new URLSearchParams(window.location.search).get('motionlog') === '1');
    const on = (kind: string) => (e: Event) => {
      const ae = e as AnimationEvent;
      if (!WATCH.test(ae.animationName)) return;
      push(kind, describe(ae));
    };
    const start = on('start'), end = on('end'), cancel = on('cancel');
    document.addEventListener('animationstart', start, true);
    document.addEventListener('animationend', end, true);
    document.addEventListener('animationcancel', cancel, true);
    const rerender = () => force((n) => n + 1);
    listeners.push(rerender);
    return () => {
      document.removeEventListener('animationstart', start, true);
      document.removeEventListener('animationend', end, true);
      document.removeEventListener('animationcancel', cancel, true);
      listeners = listeners.filter((f) => f !== rerender);
    };
  }, []);
  if (!show) return null;
  return (
    <div
      onClick={() => { log.length = 0; emit(); }}
      className="fixed left-2 right-2 top-2 z-[90] max-h-[40dvh] overflow-y-auto rounded-input bg-black/80 p-2 font-mono text-[10px] leading-tight text-white"
    >
      {log.length === 0 ? 'motion log: take a receipt photo' : log.map((m, i) => (
        <div key={i}>{m.t}ms {m.event} {m.detail}</div>
      ))}
    </div>
  );
}

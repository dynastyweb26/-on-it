'use client';
// The design's run() / fit() (RecapPlayer.dc.html), driven by the story clock
// instead of the design's own timer. Every [data-a] element becomes a WAAPI
// animation with the design's keyframes, delay (data-d), duration (data-dur) and
// easing, created paused and positioned by the clock (so pause, replay and
// back-tap are exact). data-a="count" elements count from 0 over data-dur.
import { useEffect, useLayoutEffect, type RefObject } from 'react';
import type { SlideClock } from '@/components/recap/clock';
import { money } from '@/components/recap/copy';

const E = 'cubic-bezier(.2,.8,.2,1)';
const BACK = 'cubic-bezier(.34,1.56,.64,1)';
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** data-fit / data-affit: step the font down until the text fits (design fit()). */
export function fitText(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-fit]').forEach((el) => {
    let z = Number(el.dataset.fit);
    el.style.fontSize = `${z}px`;
    while (el.scrollWidth > el.clientWidth + 1 && z > 14) { z -= 2; el.style.fontSize = `${z}px`; }
  });
  root.querySelectorAll<HTMLElement>('[data-affit]').forEach((el) => {
    let z = Number(el.dataset.affit);
    const lh = Number(el.dataset.lh), max = Number(el.dataset.max);
    const set = () => { el.style.fontSize = `${z}px`; el.style.lineHeight = `${Math.round(z * lh)}px`; };
    set();
    while (el.offsetHeight > max && z > 28) { z -= 2; set(); }
  });
}

const fmtFor = (kind: string | undefined) => (kind === 'money' ? money : (n: number) => String(Math.round(n)));

type Count = { el: HTMLElement; v: number; f: (n: number) => string; d: number; dur: number };

export function useDesignRun(root: RefObject<HTMLElement>, clock: SlideClock, reduced: boolean) {
  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    fitText(el);
    const refit = () => fitText(el);
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(refit).catch(() => undefined);
      document.fonts.addEventListener?.('loadingdone', refit);
    }
    const counts: Count[] = [];
    el.querySelectorAll<HTMLElement>('[data-a="count"]').forEach((c) => {
      counts.push({ el: c, v: Number(c.dataset.v) || 0, f: fmtFor(c.dataset.fmt), d: Number(c.dataset.d) || 0, dur: Number(c.dataset.dur) || 1200 });
    });
    // Reduce Motion (the design returns before animating): everything settled.
    if (reduced) {
      counts.forEach((c) => { c.el.textContent = c.f(c.v); });
      return () => { document.fonts?.removeEventListener?.('loadingdone', refit); };
    }
    const anims: Animation[] = [];
    const A = (target: Element, frames: Keyframe[], delay: number, dur: number, easing = E) => {
      try {
        const a = target.animate(frames, { delay, duration: Math.max(1, dur), easing, fill: 'both' });
        a.pause(); a.currentTime = 0; anims.push(a);
      } catch { /* an element the engine can't animate stays settled */ }
    };
    el.querySelectorAll<SVGGeometryElement | HTMLElement>('[data-a]').forEach((n) => {
      const ds = (n as HTMLElement).dataset;
      const d = Number(ds.d) || 0, k = ds.a, dur = Number(ds.dur) || 0, ease = ds.ease;
      if (k === 'up') A(n, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], d, dur || 520);
      else if (k === 'left') A(n, [{ opacity: 0, transform: 'translateX(-28px)' }, { opacity: 1, transform: 'none' }], d, dur || 520);
      else if (k === 'pop') A(n, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }], d, dur || 440, BACK);
      else if (k === 'fade') A(n, [{ opacity: 0 }, { opacity: 1 }], d, dur || 300, 'linear');
      else if (k === 'gx') A(n, [{ transform: 'scaleX(0)' }, { transform: 'none' }], d, dur || 700);
      else if (k === 'wipe') A(n, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], d, dur || 900, 'cubic-bezier(.65,0,.35,1)');
      else if (k === 'count') A(n, [{ opacity: 0 }, { opacity: 1 }], d, 200, 'linear');
      else if (k === 'draw') {
        if (ds.len != null) {
          const L = Number(ds.len);
          A(n, [{ strokeDashoffset: L, opacity: 0 }, { offset: 0.02, opacity: 1 }, { strokeDashoffset: 0, opacity: 1 }], d, dur || 1200, ease || 'cubic-bezier(.65,0,.35,1)');
        } else if ('getTotalLength' in n) {
          const L = (n as SVGGeometryElement).getTotalLength();
          A(n, [{ strokeDasharray: L, strokeDashoffset: L }, { strokeDasharray: L, strokeDashoffset: 0 }], d, dur || 1200, 'cubic-bezier(.65,0,.35,1)');
        }
      }
    });
    const seek = (t: number) => {
      for (const a of anims) a.currentTime = t;
      for (const c of counts) {
        const p = Math.min(1, Math.max(0, (t - c.d) / c.dur));
        c.el.textContent = c.f(c.v * (1 - Math.pow(1 - p, 3)));
      }
    };
    const off = clock.subscribe(seek);
    return () => {
      off();
      anims.forEach((a) => a.cancel());
      document.fonts?.removeEventListener?.('loadingdone', refit);
    };
    // Built once per slide instance: the player remounts a slide to replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);
}

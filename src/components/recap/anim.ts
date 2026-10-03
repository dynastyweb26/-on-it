'use client';
// The prototype's Slide.anim / fadeUp / pop / grow / number (slides.js), for
// React slides. Every animation is WAAPI, created PAUSED, and positioned only
// by the slide clock (currentTime = t), so the one rAF loop drives them all.
// Static CSS is the settled end state; animations go FROM something TO it.
// Reduce Motion: 'in' animations become a 350 ms opacity fade, 'move' / 'fx'
// are dropped, numbers show their final value (RECAP-SPEC §0, §3).
import { useEffect, useLayoutEffect } from 'react';
import { RECAP_CONFIG, type EaseName } from '@/lib/recap/config';
import { easeFn, type Beats } from '@/lib/recap/timing';
import type { SlideClock } from '@/components/recap/clock';

export type AnimKind = 'in' | 'move' | 'fx';
export type AnimOpts = { i?: number; offset?: number; dur?: number; ease?: EaseName; kind?: AnimKind; fill?: FillMode };

export class SlideAnims {
  private anims: Animation[] = [];
  private nums: { el: HTMLElement; value: number; start: number; dur: number; ease: (x: number) => number; fmt: (n: number) => string }[] = [];
  constructor(private B: Beats, private reduced: boolean) {}

  anim(el: Element | null, frames: Keyframe[], beat: string, o: AnimOpts = {}): Animation | null {
    if (!el) return null;
    const b = this.B[beat];
    if (!b) throw new Error(`no beat ${beat}`);
    const kind = o.kind ?? 'in';
    const delay = b.start + (o.i ?? 0) * b.stagger + (o.offset ?? 0);
    let dur = o.dur ?? b.dur;
    let easing = RECAP_CONFIG.ease[o.ease ?? b.ease] ?? 'linear';
    let fill: FillMode = o.fill ?? 'both';
    if (this.reduced) {
      if (kind !== 'in') return null;
      const last = frames[frames.length - 1];
      frames = [{ opacity: 0 }, { opacity: last.opacity ?? 1 }];
      dur = RECAP_CONFIG.reduce.fade; easing = 'linear'; fill = 'both';
    }
    const a = el.animate(frames, { delay, duration: Math.max(1, dur), easing, fill });
    a.pause();
    a.currentTime = 0;
    this.anims.push(a);
    return a;
  }
  fadeUp(el: Element | null, beat: string, o: AnimOpts & { dy?: number } = {}) {
    return this.anim(el, [{ opacity: 0, transform: `translateY(${o.dy ?? 12}px)` }, { opacity: 1, transform: 'none' }], beat, o);
  }
  pop(el: Element | null, beat: string, o: AnimOpts = {}) {
    return this.anim(el, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], beat, o);
  }
  grow(el: Element | null, beat: string, axis: 'X' | 'Y' = 'X', o: AnimOpts = {}) {
    return this.anim(el, [{ transform: `scale${axis}(0)` }, { transform: 'none' }], beat, o);
  }
  /** Count from 0 with the beat's ease; fades in over 200 ms. */
  number(el: HTMLElement | null, value: number, beat: string, fmt: (n: number) => string) {
    if (!el) return;
    const b = this.B[beat];
    this.nums.push({ el, value, start: b.start, dur: b.dur, ease: easeFn(b.ease), fmt });
    el.textContent = fmt(this.reduced ? value : 0);
    this.anim(el, [{ opacity: 0 }, { opacity: 1 }], beat, { dur: 200 });
  }
  seek(t: number) {
    for (const a of this.anims) a.currentTime = t;
    if (this.reduced) return;
    for (const n of this.nums) n.el.textContent = n.fmt(n.value * n.ease(Math.min(1, Math.max(0, (t - n.start) / n.dur))));
  }
  destroy() {
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
    this.nums = [];
  }
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Build a slide's animations once it's in the DOM, then let the clock drive
 *  them. `build` registers everything on the SlideAnims it's given. */
export function useSlideAnims(clock: SlideClock, B: Beats, reduced: boolean, build: (S: SlideAnims) => void) {
  useIsoLayoutEffect(() => {
    const S = new SlideAnims(B, reduced);
    build(S);
    const off = clock.subscribe((t) => S.seek(t));
    return () => { off(); S.destroy(); };
    // Built once per slide instance: the player remounts a slide to replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);
}

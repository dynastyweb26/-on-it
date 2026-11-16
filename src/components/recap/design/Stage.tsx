'use client';
// The design's 390 x 844 frame (RecapPlayer.dc.html) fitted into whatever the
// story gives us: the frame keeps its size and is scaled uniformly, so every
// absolute position and spacing in the slides is the design's own.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { SlideProps } from '@/components/recap/clock';
import { useDesignRun } from './run';
import { s } from './css';

export const STAGE_W = 390;
export const STAGE_H = 844;

export default function Stage({ clock, reduced, children }: Pick<SlideProps, 'clock' | 'reduced'> & { children?: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const o = outer.current;
    if (!o) return;
    const fit = () => setK(Math.min(o.clientWidth / STAGE_W, o.clientHeight / STAGE_H) || 1);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    return () => ro.disconnect();
  }, []);
  useDesignRun(inner, clock, reduced);
  return (
    <div ref={outer} style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden')}>
      <div ref={inner} style={{ ...s(`position:relative;flex:none;width:${STAGE_W}px;height:${STAGE_H}px;color:#1f1b13`), transform: `scale(${k})` }}>
        {children}
      </div>
    </div>
  );
}

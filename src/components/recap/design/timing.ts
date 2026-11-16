// The design's slide clock: a slide plays 6200 ms and its progress segment
// fills from 2800 ms to 6200 ms (RecapPlayer.dc.html: `t >= 6200`, `(t-2800)/3400`).
// The slides carry their own data-d / data-dur delays, so there are no beats
// and no sound cues (RULE 6: the sound button toggles its icon only).
import type { SlideTiming } from '@/lib/recap/timing';

export const DESIGN_HERO_END = 2800;
export const DESIGN_DURATION = 6200;

// `key` is never read by the design slides; timing.ts's union stays untouched.
export const designTiming = (): SlideTiming => ({
  key: 'opener', theme: 'light', B: {}, heroEnd: DESIGN_HERO_END, duration: DESIGN_DURATION, cues: [],
});

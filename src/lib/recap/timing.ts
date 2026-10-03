// The recap's timing engine (RECAP-SPEC §3), ported from the prototype's
// util.js (cubic-bezier solver, beat resolution, cue resolution) and the
// item counts each slide hands to it (slides.js S.resolve calls). Pure: no
// DOM, so the player, the slides and the tests all share one source.
import { RECAP_CONFIG, type Beat, type CueSpec, type EaseName, type SoundName } from '@/lib/recap/config';
import { monthWeeks, type RecapPayload, type RecapSlide } from '@/lib/recap/payload';
import { openerSeries } from '@/lib/recap/columns';

/** CSS cubic-bezier → JS easing function (count-ups, tick spacing). */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const ds = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x, d = ds(t);
      if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    if (Math.abs(sx(t) - x) > 1e-3) {
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 30; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

export function easeFn(name: EaseName | string | undefined): (x: number) => number {
  const s = (name && RECAP_CONFIG.ease[name as EaseName]) || name || 'linear';
  const m = s.match(/cubic-bezier\(([^)]+)\)/);
  if (!m) return (x) => Math.min(1, Math.max(0, x));
  const [a, b, c, d] = m[1].split(',').map(Number);
  return cubicBezier(a, b, c, d);
}

export type ResolvedBeat = { start: number; dur: number; stagger: number; ease: EaseName; n: number; end: number };
export type Beats = Record<string, ResolvedBeat>;

/** "beat.start" / "beat.end" ± offset → ms. */
export function refBeat(ref: number | string, get: (k: string) => ResolvedBeat): number {
  if (typeof ref === 'number') return ref;
  const m = String(ref).match(/^(\w+)\.(start|end)([+-]\d+)?$/);
  if (!m) throw new Error(`Bad beat ref ${ref}`);
  return get(m[1])[m[2] as 'start' | 'end'] + (m[3] ? Number(m[3]) : 0);
}

/** Every beat's start/end for these item counts (a missing count = 1). */
export function resolveBeats(beats: Record<string, Beat>, counts: Record<string, number>): Beats {
  const out: Beats = {};
  const get = (k: string): ResolvedBeat => {
    if (out[k]) return out[k];
    const b = beats[k];
    if (!b) throw new Error(`Unknown beat ${k}`);
    const start = refBeat(b.delay, get);
    const n = counts[k] ?? 1;
    const stagger = b.span != null && n > 1 ? b.span / (n - 1) : b.stagger ?? 0;
    return (out[k] = { start, dur: b.dur, stagger, ease: b.ease ?? 'out', n, end: n > 0 ? start + (n - 1) * stagger + b.dur : start });
  };
  Object.keys(beats).forEach(get);
  return out;
}

export type Cue = { t: number; sound: SoundName; db: number; label: string; silent?: boolean };

/** Sound cues at ms. A `ticks` cue becomes one tick each time the beat's eased
 *  progress crosses k/N (they bunch early, spread as the count slows); none
 *  under Reduce Motion, where numbers don't count. */
export function resolveCues(cues: CueSpec[], B: Beats, reduced: boolean): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    const [beat, edge = 'start'] = c.at.split('.');
    const b = B[beat];
    if (!b || b.n === 0) continue;
    if (c.sound === 'ticks') {
      if (reduced) continue;
      out.push({ t: b.start, sound: 'none', db: c.db, label: 'Count-up ticks' });
      const ease = easeFn(b.ease), N = c.count ?? 12;
      for (let k = 1; k <= N; k++) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (ease(mid) < k / N) lo = mid; else hi = mid; }
        out.push({ t: b.start + hi * b.dur, sound: 'tick', db: c.db, label: '', silent: true });
      }
      continue;
    }
    const times = edge === 'each'
      ? Array.from({ length: b.n }, (_, i) => b.start + i * b.stagger)
      : [edge === 'end' ? b.end : b.start];
    times.forEach((t, i) => out.push({
      t: t + (c.offset ?? 0), sound: c.sound, db: c.db,
      label: (c.label ?? c.sound) + (edge === 'each' && b.n > 1 ? ` ${i + 1}` : ''),
    }));
  }
  return out.sort((a, b) => a.t - b.t);
}

const LIST = 3;   // full cards on owed / caught up (the payload keeps the 3 largest)
const EDGES = 6;  // stacked card edges behind them, at most

/** The item counts each slide gives its beats, from the payload (the
 *  prototype's S.resolve calls). The payload keeps ≤ 3 invoices plus a count,
 *  so "the rest" comes from `count`. */
export function slideCounts(key: RecapSlide, p: RecapPayload): Record<string, number> {
  switch (key) {
    case 'opener':
      return { cols: openerSeries(p).values.length };   // 7 days, or 4–5 calendar weeks
    case 'moneyIn': {
      const m = p.paymentMethods.filter((x) => x.amount > 0).length;
      return { chips: m, pour: m, segs: m, pct: m };
    }
    case 'moneyInZero':
      return { rows: Math.min(LIST, p.owed.invoices.length), total: p.owed.count ? 1 : 0 };
    case 'moneyOut':
      return { receipts: Math.min(LIST, p.spend.receipts.length), trips: p.topVendor?.trips.length ?? 0 };
    case 'keptInvest':
      return { outBars: p.spend.categories.length };
    case 'glance': {
      const w = monthWeeks(p).length;
      return { bars: w, vals: w };
    }
    case 'owed': {
      const full = Math.min(LIST, p.owed.invoices.length), rest = Math.max(0, p.owed.count - full);
      return { cards: full, edges: Math.min(EDGES, rest), more: rest ? 1 : 0 };
    }
    case 'caughtUp': {
      const nF = Math.min(LIST, p.paid.invoices.length), rest = Math.max(0, p.paid.count - nF), layers = Math.min(EDGES, rest);
      return {
        cards: nF, stamp: nF, edges: layers, ripple: layers, more: rest ? 1 : 0,
        square: nF ? 1 : 0, band: nF ? 1 : 0, mark: nF ? 1 : 0, glint: nF ? 1 : 0,
      };
    }
    default:
      return {};
  }
}

export type SlideTiming = { key: RecapSlide; theme: 'light' | 'dark'; B: Beats; heroEnd: number; duration: number; cues: Cue[] };

/** One slide's resolved timing: the auto-advance timer starts at heroEnd and
 *  runs `hold` ms (duration = heroEnd + hold). */
export function slideTiming(key: RecapSlide, p: RecapPayload, reduced: boolean): SlideTiming {
  const cfg = RECAP_CONFIG.slides[key];
  const B = resolveBeats(cfg.beats, slideCounts(key, p));
  const heroEnd = refBeat(cfg.heroEnd, (k) => B[k]);
  return { key, theme: cfg.theme, B, heroEnd, duration: heroEnd + cfg.hold, cues: resolveCues(cfg.cues, B, reduced) };
}

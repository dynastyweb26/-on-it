// On It Recap — ONE place for every timing, easing and sound level
// (RECAP-SPEC §10: the prototype's OnItRecap.CONFIG, verbatim, except the
// opener, which is the On It build's horizon opener from §4).
//
// Times are ms from slide start. A beat's `delay` is a number or a reference:
// "beat.start" / "beat.end" plus an optional +/- offset, e.g. "count.end+250".
// `stagger` = ms between items in the beat; the slide supplies the item count,
// so beat.end = start + (n-1)*stagger + dur (n = 0 → zero-length beat).
// heroEnd: the slide's auto-advance timer only starts here; then `hold` ms.
import type { RecapSlide } from '@/lib/recap/payload';

export type EaseName = 'linear' | 'out' | 'outQuart' | 'inOut' | 'back' | 'snap';
export type BeatRef = number | string;
export type Beat = { delay: BeatRef; dur: number; stagger?: number; ease?: EaseName };
export type SoundName = 'whoosh' | 'sweep' | 'tick' | 'ticks' | 'none' | 'chime' | 'drop' | 'flutter' | 'stamp' | 'ripple' | 'snap' | 'glint';
export type CueSpec = { at: string; sound: SoundName; db: number; label?: string; count?: number; offset?: number };
export type SlideConfig = { theme: 'light' | 'dark'; heroEnd: string; hold: number; beats: Record<string, Beat>; cues: CueSpec[] };

export type RecapConfig = {
  ease: Record<EaseName, string>;
  transition: { dur: number; ease: EaseName; dim: number; markWidth: number; cue: { sound: SoundName; db: number; label: string } };
  reduce: { fade: number; transition: number };
  input: { holdToPause: number; backZone: number };
  slowMo: number;
  categoryColor: Record<string, string>;
  sound: { placeholder: boolean; music: { bpm: number; bars: number; db: number; fadeIn: number; fadeOut: number; duckDb: number; duckMs: number } };
  slides: Record<RecapSlide, SlideConfig>;
};

export const RECAP_CONFIG: RecapConfig = {
  ease: {
    linear: 'linear',
    out: 'cubic-bezier(.33,1,.68,1)',        // default entrance
    outQuart: 'cubic-bezier(.25,1,.5,1)',    // count-ups
    inOut: 'cubic-bezier(.65,0,.35,1)',      // wipes, sweeps, squaring up
    back: 'cubic-bezier(.34,1.56,.64,1)',    // settle with overshoot
    snap: 'cubic-bezier(.3,1.75,.5,1)'       // band locking on
  },
  transition: { dur: 700, ease: 'inOut', dim: 0.75, markWidth: 340, cue: { sound: 'whoosh', db: -14, label: 'Swoosh wipe' } },
  reduce: { fade: 350, transition: 280 },     // Reduce Motion: opacity only, numbers shown final
  input: { holdToPause: 220, backZone: 1 / 3 },
  slowMo: 0.25,
  categoryColor: { Supplies: 'var(--onit-data-1)', Fuel: 'var(--onit-data-2)', Tools: 'var(--onit-data-3)', Vehicle: 'var(--onit-data-4)', Other: 'var(--onit-data-5)' },
  sound: {
    placeholder: true,
    music: { bpm: 90, bars: 12, db: -24, fadeIn: 1200, fadeOut: 600, duckDb: -4, duckMs: 700 }
  },
  slides: {
    // On It build (RECAP-SPEC §4, decided 2026-10-02): the HORIZON opener,
    // replacing the prototype's columns + ribbon opener.
    opener: {
      theme: 'dark', heroEnd: 'fill.end', hold: 2400,
      beats: {
        line:  { delay: 200, dur: 1200, ease: 'out' },               // draws left → right; the rider is on its head
        lift:  { delay: 'line.start+566', dur: 700, ease: 'inOut' }, // = the moment the head passes 85 % of the line
        fill:  { delay: 'line.end-200', dur: 900, ease: 'out' },
        haze:  { delay: 'fill.start+200', dur: 900 },
        label: { delay: 'lift.start+300', dur: 500 },
        title: { delay: 'lift.start+450', dur: 650 },
        range: { delay: 'lift.start+700', dur: 500 },
        aff:   { delay: 'lift.end+300', dur: 800 }
      },
      cues: [
        { at: 'line.start', sound: 'sweep', db: -18, label: 'Line draws' },
        { at: 'lift.end', sound: 'chime', db: -20, label: 'Swoosh settles (soft)' }
      ]
    },
    moneyIn: {
      theme: 'light', heroEnd: 'card.end', hold: 2800,
      beats: {
        label:   { delay: 100, dur: 500 },
        lead:    { delay: 200, dur: 500 },
        count:   { delay: 400, dur: 2000, ease: 'outQuart' },
        chips:   { delay: 500, dur: 650, stagger: 260, ease: 'back' },
        pour:    { delay: 'chips.start+450', dur: 520, stagger: 260, ease: 'inOut' },
        segs:    { delay: 'pour.start+420', dur: 560, stagger: 260, ease: 'out' },
        pct:     { delay: 'segs.start+360', dur: 300, stagger: 260 },
        caption: { delay: 'count.end-200', dur: 500 },
        card:    { delay: 'count.end+250', dur: 600 },
        share:   { delay: 'card.start+250', dur: 900 }
      },
      cues: [
        { at: 'pour.each', sound: 'drop', db: -24, label: 'Pour into bar' },
        { at: 'count', sound: 'ticks', db: -26, count: 14 },
        { at: 'count.end', sound: 'chime', db: -12, label: 'Total lands' }
      ]
    },
    moneyInZero: {
      theme: 'light', heroEnd: 'total.end', hold: 2600,
      beats: {
        label: { delay: 100, dur: 500 },
        title: { delay: 250, dur: 600 },
        body:  { delay: 600, dur: 500 },
        rows:  { delay: 1000, dur: 600, stagger: 240 },
        total: { delay: 'rows.end+100', dur: 1200, ease: 'outQuart' }
      },
      cues: [{ at: 'total', sound: 'ticks', db: -28, count: 10 }]   // calm: no chime
    },
    moneyOut: {
      theme: 'dark', heroEnd: 'card.end', hold: 2800,
      beats: {
        label:    { delay: 100, dur: 500 },
        lead:     { delay: 200, dur: 500 },
        count:    { delay: 400, dur: 1600, ease: 'outQuart' },
        receipts: { delay: 450, dur: 800, stagger: 300, ease: 'out' },
        ring:     { delay: 1500, dur: 1300, ease: 'linear' },   // split by category share, palette order
        center:   { delay: 'ring.end-200', dur: 500 },
        legend:   { delay: 'ring.end', dur: 500 },
        card:     { delay: 'ring.end+300', dur: 600 },
        trips:    { delay: 'card.start+300', dur: 400, stagger: 140 }
      },
      cues: [
        { at: 'receipts.each', sound: 'flutter', db: -22, label: 'Receipt' },
        { at: 'count', sound: 'ticks', db: -26, count: 12 },
        { at: 'count.end', sound: 'chime', db: -14, label: 'Total lands' }
      ]
    },
    kept: {
      theme: 'light', heroEnd: 'chip.end', hold: 2600,
      beats: {
        label:   { delay: 100, dur: 500 },
        lead:    { delay: 200, dur: 500 },
        ring:    { delay: 400, dur: 2000, ease: 'out' },          // ring fill + net count-up, in sync
        caption: { delay: 'ring.end-600', dur: 500 },
        chip:    { delay: 'ring.end+100', dur: 500, ease: 'back' },
        foot:    { delay: 'chip.start+300', dur: 500 }
      },
      cues: [
        { at: 'ring', sound: 'ticks', db: -26, count: 14 },
        { at: 'ring.end', sound: 'chime', db: -12, label: 'Ring + net land' }
      ]
    },
    keptInvest: {
      theme: 'light', heroEnd: 'chip.end', hold: 2600,
      beats: {
        label:   { delay: 100, dur: 500 },
        title:   { delay: 250, dur: 600 },
        count:   { delay: 800, dur: 1400, ease: 'outQuart' },
        inBar:   { delay: 1000, dur: 900 },
        outBars: { delay: 1200, dur: 800, stagger: 200 },
        chip:    { delay: 'outBars.end+200', dur: 500 }
      },
      cues: [
        { at: 'count', sound: 'ticks', db: -28, count: 10 },
        { at: 'count.end', sound: 'chime', db: -22, label: 'Net lands (soft)' }
      ]
    },
    glance: {
      theme: 'light', heroEnd: 'card.end', hold: 2600,
      beats: {
        label: { delay: 100, dur: 500 },
        title: { delay: 250, dur: 600 },
        sub:   { delay: 500, dur: 500 },
        total: { delay: 500, dur: 1600, ease: 'outQuart' },
        bars:  { delay: 700, dur: 900, stagger: 200 },
        vals:  { delay: 'bars.start+600', dur: 400, stagger: 200 },
        card:  { delay: 'bars.end+200', dur: 600 }
      },
      cues: [
        { at: 'total', sound: 'ticks', db: -26, count: 12 },
        { at: 'total.end', sound: 'chime', db: -12, label: 'Month total lands' }
      ]
    },
    owed: {
      theme: 'dark', heroEnd: 'lines.end', hold: 3000,
      beats: {
        label:    { delay: 100, dur: 500 },
        lead:     { delay: 200, dur: 500 },
        count:    { delay: 400, dur: 1600, ease: 'outQuart' },
        countcap: { delay: 'count.end-300', dur: 500 },
        cards:    { delay: 900, dur: 650, stagger: 200, ease: 'back' },
        edges:    { delay: 'cards.end-250', dur: 400, stagger: 50 },
        more:     { delay: 'edges.end+50', dur: 400, ease: 'back' },
        lines:    { delay: 'more.end+100', dur: 500 },
        cta:      { delay: 'lines.start+400', dur: 500 },
        closing:  { delay: 'cta.start+400', dur: 500 }
      },
      cues: [
        { at: 'count', sound: 'ticks', db: -26, count: 12 },
        { at: 'count.end', sound: 'chime', db: -12, label: 'Total lands' }
      ]
    },
    caughtUp: {
      theme: 'dark', heroEnd: 'glint.end', hold: 2400,   // ≈3.1s to glint end at any invoice count
      beats: {
        label:   { delay: 100, dur: 500 },
        caption: { delay: 250, dur: 500 },
        edges:   { delay: 100, dur: 400, stagger: 40 },
        cards:   { delay: 100, dur: 450, stagger: 120, ease: 'out' },
        stamp:   { delay: 560, dur: 170, stagger: 330, ease: 'back' },  // top 3 only, one by one
        ripple:  { delay: 'stamp.end+100', dur: 200, stagger: 40 },      // across stacked edges (≤6)
        square:  { delay: 'ripple.end+40', dur: 360, ease: 'inOut' },
        band:    { delay: 'square.end', dur: 340, ease: 'snap' },
        mark:    { delay: 'band.end-120', dur: 340, ease: 'back' },
        glint:   { delay: 'band.end', dur: 500, ease: 'out' },
        more:    { delay: 'ripple.end', dur: 400, ease: 'back' },
        title:   { delay: 'band.end+100', dur: 600 },
        body:    { delay: 'band.end+300', dur: 500 },
        cta:     { delay: 'band.end+550', dur: 500 },
        closing: { delay: 'band.end+800', dur: 500 }
      },
      cues: [
        { at: 'stamp.each', sound: 'stamp', db: -14, label: 'PAID' },
        { at: 'ripple.start', sound: 'ripple', db: -20, label: 'Edge ripple' },
        { at: 'band.end', sound: 'snap', db: -10, label: 'Band snaps on' },
        { at: 'glint.start', sound: 'glint', db: -24, label: 'Glint' }
      ]
    },
    quiet: {
      theme: 'light', heroEnd: 'card.end', hold: 3000,
      beats: { card: { delay: 150, dur: 700 } },
      cues: []
    }
  }
};

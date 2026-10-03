'use client';
// The recap story player (RECAP-SPEC §2), ported from the prototype's
// player.js. Loaded on demand (dynamic import): nothing here ships in the
// app's main bundle.
//  - ONE clock: a single requestAnimationFrame loop (dt capped at 64 ms)
//    advances slide time t → the slide's clock (its paused WAAPI animations and
//    count-ups follow) → sound cues whose time falls in (prevT, t].
//  - Auto-advance: duration = heroEnd + hold; the progress segment fills only
//    from heroEnd. The last slide holds at its end.
//  - Input (whole screen): tap the right two-thirds → next, the left third →
//    previous (on slide 1 = replay it); press ≥ 220 ms → pause ("Paused"
//    pill), release → resume, no navigation; pointer leaving while held →
//    resume. Buttons (mute, close, slide CTAs) handle their own taps.
//    Keyboard: → / ← navigate, Space pauses, Escape closes.
//  - Transition: the swoosh wipe, 700 ms inOut — transform/opacity only (see
//    recap.css). Reduce Motion: a 280 ms cross-fade, no mark. A tap during a
//    transition finishes it and starts the next.
//  - Sound (lib/recap/audio.ts, placeholder synthesis per the §6 cue sheet):
//    the music bed starts when the story opens if the opening tap primed audio
//    (primeRecapAudio), otherwise on the first tap inside the story; cues play
//    as the clock crosses them, the whoosh on every transition; the bed pauses
//    while held / hidden and fades out on close. Web Audio only, ambient
//    session (the silent switch mutes it). Mute persists in localStorage
//    'onit-recap-muted'. `onCue` still reports each cue (dev log).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import { RECAP_CONFIG } from '@/lib/recap/config';
import { recapAudio } from '@/lib/recap/audio';
import { recapSequence, type RecapPayload } from '@/lib/recap/payload';
import { slideTiming, type Cue, type SlideTiming } from '@/lib/recap/timing';
import { createClock, type RecapAction, type SlideClock } from '@/components/recap/clock';
import { RECAP_SLIDE_NAMES } from '@/components/recap/names';
import { SLIDES } from '@/components/recap/slides';
import './recap.css';

const MUTE_KEY = 'onit-recap-muted';
const OPENS_KEY = 'onit-recap-opens';
const DT_MAX = 64;

type Entry = { key: number; idx: number; clock: SlideClock; timing: SlideTiming };
type Trans = { anims: Animation[]; p: number; dur: number; theme: 'light' | 'dark' };

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

export type RecapStoryProps = {
  payload: RecapPayload;
  onClose: () => void;
  /** CTA taps from a slide (View invoices, New invoice). */
  onAction?: (a: RecapAction) => void;
  /** Sound cues as they fire (not called while muted). */
  onCue?: (c: Cue) => void;
  /** Forces Reduce Motion on/off (dev preview); default follows the OS. */
  reducedMotion?: boolean;
  /** Dev preview only: open on this slide (clamped). */
  startAt?: number;
};

export default function RecapStory({ payload, onClose, onAction, onCue, reducedMotion, startAt = 0 }: RecapStoryProps) {
  const osReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? osReduced;
  const keys = useMemo(() => recapSequence(payload), [payload]);
  const timings = useMemo(() => keys.map((k) => slideTiming(k, payload, reduced)), [keys, payload, reduced]);
  const n = keys.length;
  const quietOnly = n === 1 && keys[0] === 'quiet';
  const first = Math.min(Math.max(0, startAt), n - 1);

  const rootRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<(HTMLElement | null)[]>([]);
  const wipeRef = useRef<HTMLImageElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef(new Map<number, { clip: HTMLDivElement | null; inner: HTMLDivElement | null; dim: HTMLDivElement | null }>());

  // Per-layer elements for the wipe. Get-or-create: React attaches a child's
  // ref before its parent's. Entries of unmounted layers are pruned on render.
  const slot = (key: number) => {
    let L = layerRefs.current.get(key);
    if (!L) { L = { clip: null, inner: null, dim: null }; layerRefs.current.set(key, L); }
    return L;
  };

  const uid = useRef(0);
  const makeEntry = useCallback((idx: number): Entry => ({ key: ++uid.current, idx, clock: createClock(), timing: timings[idx] }), [timings]);
  // entries[0] = the current slide; entries[1] (during a transition) = the outgoing one.
  const [entries, setEntries] = useState<Entry[]>(() => [makeEntry(first)]);
  const [pendingTrans, setPendingTrans] = useState<{ dir: 1 | -1; key: number } | null>(null);

  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [announce, setAnnounce] = useState('');
  // Opens on this device: the opener's affirmation rotates per open (§8).
  const [opens] = useState(() => {
    try {
      const n = (Number(localStorage.getItem(OPENS_KEY)) || 0) + 1;
      localStorage.setItem(OPENS_KEY, String(n));
      return n;
    } catch { return 1; }
  });

  // Loop state lives in refs: the clock never re-renders React.
  const st = useRef({ idx: first, t: 0, prevT: -1, held: false, spacePaused: false, hidden: false, trans: null as Trans | null, muted: false });
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const cbs = useRef({ onCue, onClose, onAction });
  cbs.current = { onCue, onClose, onAction };

  const setTheme = (t: 'light' | 'dark') => { if (rootRef.current) rootRef.current.dataset.theme = t; };
  const playing = () => !st.current.held && !st.current.spacePaused && !st.current.hidden;
  const syncPaused = () => {
    setPaused(st.current.held || st.current.spacePaused);
    recapAudio()?.pauseMusic(!playing());
  };
  // Sound starts on the first gesture if the opening tap didn't prime it.
  const ensureSound = () => {
    const a = recapAudio();
    if (!a) return;
    a.resume();
    a.setMuted(st.current.muted);
    if (!a.musicOn) a.startMusic();
  };
  const cue = (c: Cue) => {
    if (st.current.muted) return;
    recapAudio()?.play(c.sound, c.db);
    cbs.current.onCue?.(c);
  };

  useEffect(() => {
    try { const m = localStorage.getItem(MUTE_KEY) === '1'; st.current.muted = m; setMuted(m); } catch { /* storage blocked: unmuted */ }
    // Music bed: now if the opening tap primed the audio context, else on the first tap.
    const a = recapAudio();
    if (a) {
      a.setMuted(st.current.muted);
      if (a.running) a.startMusic();
    }
    return () => { recapAudio()?.stopMusic(); };   // 600 ms fade-out on close
  }, []);

  const endTrans = useCallback(() => {
    const T = st.current.trans;
    if (!T) return;
    T.anims.forEach((a) => a.cancel());
    st.current.trans = null;
    setEntries((es) => es.slice(0, 1));
    setTheme(timings[st.current.idx].theme);
  }, [timings]);

  /** Show slide i from t = 0 with no transition (open, replay, Reduce Motion change). */
  const showFresh = useCallback((i: number) => {
    const s = st.current;
    if (s.trans) { s.trans.anims.forEach((a) => a.cancel()); s.trans = null; }
    setPendingTrans(null);
    s.idx = i; s.t = 0; s.prevT = -1;
    setEntries([makeEntry(i)]);
    setTheme(timings[i].theme);
    setAnnounce(`${RECAP_SLIDE_NAMES[keys[i]]}, ${i + 1} of ${n}`);
  }, [keys, makeEntry, n, timings]);

  const go = useCallback((i: number) => {
    const s = st.current;
    if (s.trans) endTrans();
    if (i < 0) { showFresh(0); return; }
    const cur = entriesRef.current[0];
    if (i >= n) { s.t = cur.timing.duration; s.prevT = s.t; cur.clock.seek(s.t); return; } // last slide holds
    const dir: 1 | -1 = i > s.idx ? 1 : -1;
    const next = makeEntry(i);
    s.idx = i; s.t = 0; s.prevT = -1;
    setEntries([next, cur]);
    setPendingTrans({ dir, key: cur.key });
    setAnnounce(`${RECAP_SLIDE_NAMES[keys[i]]}, ${i + 1} of ${n}`);
  }, [endTrans, keys, makeEntry, n, showFresh]);

  // A Reduce Motion change (or a new payload) restarts the current slide with the new timing.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; setTheme(timings[first].theme); setAnnounce(`${RECAP_SLIDE_NAMES[keys[first]]}, ${first + 1} of ${n}`); return; }
    showFresh(Math.min(st.current.idx, n - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timings]);

  // Start the wipe once the outgoing slide sits in its own layer.
  useLayoutEffect(() => {
    if (!pendingTrans) return;
    const L = layerRefs.current.get(pendingTrans.key);
    const root = rootRef.current;
    if (!L?.clip || !L.inner || !L.dim || !root) return;
    const C = RECAP_CONFIG.transition;
    const dur = reduced ? RECAP_CONFIG.reduce.transition : C.dur;
    const ease = RECAP_CONFIG.ease[C.ease];
    const W = root.clientWidth;
    const dir = pendingTrans.dir;
    const anims: Animation[] = [];
    const A = (el: Element | null, frames: Keyframe[], linear = false) => {
      if (!el) return;
      const a = el.animate(frames, { duration: dur, easing: linear ? 'linear' : ease, fill: 'both' });
      a.pause(); a.currentTime = 0; anims.push(a);
    };
    if (reduced) {
      A(L.clip, [{ opacity: 1 }, { opacity: 0 }], true);
    } else {
      // The outgoing slide is wiped off from the leading edge: its clip box
      // slides by `edge` while its content slides back by the same amount, so
      // the content stays put and only the edge moves (transform only).
      A(L.clip, [{ transform: 'translateX(0)' }, { transform: `translateX(${dir * W}px)` }]);
      A(L.inner, [{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * W}px)` }]);
      A(L.dim, [{ opacity: 0 }, { opacity: 1 - C.dim }]);
      const h = C.markWidth / 2, x0 = dir > 0 ? -h : W - h, x1 = dir > 0 ? W - h : -h;
      A(wipeRef.current, [
        { transform: `translateX(${x0}px) rotate(${-12 * dir}deg) scale(.9)`, opacity: 0 },
        { offset: 0.2, opacity: 1 },
        { offset: 0.5, transform: `translateX(${(x0 + x1) / 2}px) rotate(0deg) scale(1.15)` },
        { offset: 0.8, opacity: 1 },
        { transform: `translateX(${x1}px) rotate(${12 * dir}deg) scale(.9)`, opacity: 0 },
      ]);
      const b0 = dir > 0 ? -70 : W - 70, b1 = dir > 0 ? W - 70 : -70;
      A(bandRef.current, [{ transform: `translateX(${b0}px)`, opacity: 0 }, { offset: 0.5, opacity: 1 }, { transform: `translateX(${b1}px)`, opacity: 0 }]);
    }
    st.current.trans = { anims, p: 0, dur, theme: timings[st.current.idx].theme };
    cue({ t: 0, sound: C.cue.sound, db: C.cue.db, label: C.cue.label });
    setPendingTrans(null);
  }, [pendingTrans, reduced, timings]);

  // The clock.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(DT_MAX, now - last);
      last = now;
      const s = st.current;
      const cur = entriesRef.current[0];
      if (cur && cur.idx === s.idx && playing()) {
        const D = cur.timing.duration;
        s.t = Math.min(D, s.t + dt);
        cur.clock.seek(s.t);
        for (const c of cur.timing.cues) if (c.t > s.prevT && c.t <= s.t) cue(c);
        s.prevT = s.t;
        const T = s.trans;
        if (T) {
          T.p = Math.min(1, T.p + dt / T.dur);
          T.anims.forEach((a) => { a.currentTime = T.p * T.dur; });
          if (T.p > 0.5) setTheme(T.theme);
          if (T.p >= 1) endTrans();
        }
        const he = cur.timing.heroEnd;
        segRefs.current.forEach((el, i) => {
          if (!el) return;
          const v = i < s.idx ? 1 : i > s.idx ? 0 : Math.min(1, Math.max(0, (s.t - he) / (D - he || 1)));
          el.style.transform = `scaleX(${v})`;
        });
        if (s.t >= D && s.idx < n - 1 && !s.trans) go(s.idx + 1);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endTrans, go, n]);

  // Hidden tab / app in the background: hold the clock.
  useEffect(() => {
    const on = () => { st.current.hidden = document.visibilityState === 'hidden'; recapAudio()?.pauseMusic(!playing()); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // Body scroll lock + focus on open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Input ──
  const holdT = useRef<ReturnType<typeof setTimeout>>();
  const onAct = (e: { target: EventTarget | null }) => e.target instanceof Element && !!e.target.closest('[data-act]');
  function onPointerDown(e: React.PointerEvent) {
    if (!e.isPrimary || onAct(e)) return;
    clearTimeout(holdT.current);
    st.current.held = false;
    holdT.current = setTimeout(() => { st.current.held = true; syncPaused(); }, RECAP_CONFIG.input.holdToPause);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!e.isPrimary) return;
    ensureSound();
    clearTimeout(holdT.current);
    if (st.current.held) { st.current.held = false; syncPaused(); return; }
    if (onAct(e)) return;
    const r = e.currentTarget.getBoundingClientRect();
    go((e.clientX - r.left) / r.width < RECAP_CONFIG.input.backZone ? st.current.idx - 1 : st.current.idx + 1);
  }
  function onPointerLeave() {
    clearTimeout(holdT.current);
    if (st.current.held) { st.current.held = false; syncPaused(); }
  }
  function onKeyDown(e: React.KeyboardEvent) {
    ensureSound();
    if (e.key === 'Escape') { e.preventDefault(); cbs.current.onClose(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(st.current.idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(st.current.idx - 1); }
    else if (e.key === ' ' && !onAct(e)) { e.preventDefault(); st.current.spacePaused = !st.current.spacePaused; syncPaused(); }
  }
  function toggleMute() {
    const m = !st.current.muted;
    st.current.muted = m;
    setMuted(m);
    recapAudio()?.setMuted(m);
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* not persisted */ }
  }
  const action = useCallback((a: RecapAction) => cbs.current.onAction?.(a), []);

  for (const k of Array.from(layerRefs.current.keys())) if (!entries.some((e) => e.key === k)) layerRefs.current.delete(k);

  const label = payload.kind === 'month' ? 'Monthly recap' : 'Weekly recap';
  const story = (
    <div
      ref={rootRef}
      className="rc-story"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      data-theme={timings[first].theme}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {entries.map((e, i) => {
        const Slide = SLIDES[e.timing.key];
        const outgoing = i > 0;
        return (
          <div key={e.key} className="rc-layer" style={{ zIndex: outgoing ? 2 : 1 }} aria-hidden={outgoing || undefined}>
            <div className="rc-wipe-clip" ref={(el) => { slot(e.key).clip = el; }}>
              <div className="rc-wipe-inner" ref={(el) => { slot(e.key).inner = el; }}>
                <div className="rc-slide" data-theme={e.timing.theme}>
                  <Slide payload={payload} timing={e.timing} clock={e.clock} reduced={reduced} index={e.idx} count={n} opens={opens} onAction={action} />
                </div>
              </div>
              {/* Inside the moving clip box, so it dims only the outgoing slide. */}
              <div className="rc-wipe-dim" ref={(el) => { slot(e.key).dim = el; }} />
            </div>
          </div>
        );
      })}

      <div ref={bandRef} className="rc-wipeband" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={wipeRef} className="rc-wipe" src="/recap/swoosh-gold.svg" alt="" draggable={false} aria-hidden />

      <div className="rc-chrome">
        {/* "Nothing at all" is one quiet card: no story chrome beyond close (§1). */}
        <div className="rc-segs" aria-hidden style={quietOnly ? { visibility: 'hidden' } : undefined}>
          {keys.map((k, i) => (
            <div key={`${k}-${i}`} className="rc-seg"><i ref={(el) => { segRefs.current[i] = el; }} /></div>
          ))}
        </div>
        <div className="rc-head">
          <div className="rc-head-l" style={quietOnly ? { visibility: 'hidden' } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/apple-icon-180.png" alt="" />
            <span>{label}</span>
          </div>
          <div className="rc-head-r">
            {!quietOnly && (
              <button type="button" className="rc-iconbtn" data-act="mute" aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted} onClick={toggleMute}>
                <Icon name={muted ? 'volume_off' : 'volume_up'} size={21} />
              </button>
            )}
            <button type="button" className="rc-iconbtn" data-act="close" aria-label="Close recap" onClick={() => cbs.current.onClose()}>
              <Icon name="close" size={21} />
            </button>
          </div>
        </div>
        <div className="rc-paused" data-on={paused || undefined} aria-hidden={!paused}>
          <Icon name="pause" size={15} />Paused
        </div>
      </div>
      <div className="rc-sr" aria-live="polite">{announce}</div>
    </div>
  );
  return createPortal(story, document.body);
}

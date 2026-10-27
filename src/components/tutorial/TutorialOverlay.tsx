'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TutorialTab } from '@/lib/tutorial-seen';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { TUTORIALS } from './data';
import { deriveScene, sceneDuration } from './player-state';
import { MockScreen } from './mock/MockScreen';
import { LaptopShell } from './mock/MockChrome';
import styles from './tutorial.module.css';

type Rect = { x: number; y: number; w: number; h: number; r: number };

// The stage is 390 wide; its height flexes with the viewport (844 on the prototype's phone).
const STAGE_W = 390;
// The laptop stage (design/laptop/tutorial.html: a 1380x860 frame holding the
// 288 sidebar, the 1152 content area and its 72px page header). It is the stage
// from the app's xl breakpoint (1280) up; below that the phone stage is untouched.
const LAPTOP_W = 1380;
const LAPTOP_H = 860;
const PROTO_H = 844;
// Widest the stage may render (viewport px), and tallest once the viewport is
// wider than that. Phones up to 430 wide fill the viewport at any height; wider
// ones (iPad, laptop) get a phone-sized stage centred on a dimmed backdrop
// instead of a 5x scaled one.
const MAX_STAGE_W = 430;
const MAX_STAGE_H = 932;
// The mock's fake status bar (9:41, signal, wifi) is 47 tall. On a real phone the
// real one is already there, so the mock slides up under the top edge instead.
const SB_H = 47;
const REAL_PHONE = '(max-width: 500px), (pointer: coarse)';
function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a !== !b) return false;
  if (!a || !b) return true;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) <= 0.5;
}

export default function TutorialOverlay({
  tab,
  onClose,
}: {
  tab: TutorialTab;
  onClose: () => void;
}) {
  const tutorial = TUTORIALS[tab];
  const [sceneIndex, setSceneIndex] = useState(0);
  const [t, setT] = useState(0);
  const [scale, setScale] = useState(1);
  const [stageH, setStageH] = useState(PROTO_H);
  // True on iPad/laptop widths: the stage is a framed phone on an opaque backdrop.
  const [wide, setWide] = useState(false);
  // The app's xl width (>= 1280), which is where the laptop stage lives. It starts
  // false so the server and the first client render agree (no hydration mismatch)
  // and follows the query with a listener afterwards. There is no URL override: a
  // phone can never be forced into the laptop stage.
  const [xl, setXl] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const on = () => setXl(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Laptop stage: every tour except Settings for now — the mocks redrawn for the
  // design's 288 sidebar and content area. REMOVE THE TOUR CONDITION FOR EACH TOUR
  // once its mock is redrawn for laptop (Settings), i.e. plain `xl`. The rest keep
  // the framed-phone stage at every width until then.
  const laptop =
    xl && (tab === 'chat' || tab === 'clients' || tab === 'invoices' || tab === 'books');
  const frameW = laptop ? LAPTOP_W : STAGE_W;
  const frameH = laptop ? LAPTOP_H : stageH;
  const frameRef = useRef({ w: frameW, h: frameH });
  frameRef.current = { w: frameW, h: frameH };
  const [realPhone, setRealPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REAL_PHONE).matches,
  );
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [tapRect, setTapRect] = useState<Rect | null>(null);
  const [lastSpot, setLastSpot] = useState<Rect | null>(null);
  const [hlH, setHlH] = useState(150);
  const [chatMax, setChatMax] = useState(0);
  const [nudge, setNudge] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  const stageRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const t0Ref = useRef(0);
  const tRef = useRef(0);
  const lastSpotRef = useRef<Rect | null>(null);
  const lastSlotRef = useRef<'top' | 'bot'>('top');
  // Last measured card heights: full, and the compact variant.
  const fullHRef = useRef(150);
  const compactHRef = useRef(112);
  // Laptop keyboard (design tutorial): ArrowRight/Enter = next, ArrowLeft = back,
  // Esc = skip (handled by the dialog's own key handler). The callbacks are
  // defined below, so the document listener reads them through refs.
  const goNextRef = useRef<() => void>(() => {});
  const goBackRef = useRef<() => void>(() => {});
  const scene = tutorial.scenes[sceneIndex];
  const duration = sceneDuration(scene);
  const state = deriveScene(tab, scene, t);
  const isLast = sceneIndex === tutorial.scenes.length - 1;
  const finished = t >= duration;

  // The prototype's 390-wide phone screen, scaled by width to the viewport up to
  // MAX_STAGE_W; the stage height flexes to fill (up to MAX_STAGE_H), so a phone
  // has no bars. At 390 × 844 the scale is exactly 1 and the stage is exactly 844.
  useLayoutEffect(() => {
    const update = () => {
      const el = safeRef.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!(w > 0) || !(h > 0)) return;
      if (laptop) {
        // The laptop frame shrinks to fit, never grows past 1:1.
        setScale(Math.min(1, w / LAPTOP_W, h / LAPTOP_H));
        setWide(true);
        return;
      }
      const stageW = Math.min(w, MAX_STAGE_W);
      // The height cap only applies once the viewport is wider than a phone, so a
      // tall phone (360 x 1000) still fills the screen.
      const stageHpx = w > MAX_STAGE_W ? Math.min(h, MAX_STAGE_H) : h;
      const k = stageW / STAGE_W;
      setScale(k);
      setStageH(stageHpx / k);
      setWide(w > MAX_STAGE_W);
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    const box = safeRef.current;
    const ro = box ? new ResizeObserver(update) : null;
    if (box) ro?.observe(box);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [laptop]);

  // Scene clock. The prototype holds the final frame forever; nothing advances
  // until Next/Got it.
  useEffect(() => {
    t0Ref.current = performance.now();
    tRef.current = 0;
    setT(0);
  }, [sceneIndex]);

  useEffect(() => {
    if (reducedMotion) {
      tRef.current = duration;
      setT(duration);
      return;
    }
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const next = Math.min((now - t0Ref.current) / 1000, duration);
      if (now - last > 30 || next >= duration) {
        last = now;
        if (next !== tRef.current) {
          tRef.current = next;
          setT(next);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [duration, reducedMotion, sceneIndex]);

  // Geometry is measured in stage coordinates (divide the rendered rect by the
  // current scale), exactly like the prototype's measure(). The prototype runs
  // it on every animation frame, so a target that moves after the scene clock
  // stops (the chat scrolling to its end, a sheet settling, the stage changing
  // height) is still tracked; the setters below only re-render on a change.
  const keysRef = useRef<{ spot: string | null; tap: string | null }>({ spot: null, tap: null });
  keysRef.current = { spot: state.spotKey ?? null, tap: state.tapKey ?? null };
  const measure = useCallback(() => {
    const root = stageRef.current;
    if (!root) return;
    const pr = root.getBoundingClientRect();
    const k = pr.width / frameRef.current.w || 1;
    const rel = (key: string | null): Rect | null => {
      if (!key) return null;
      const el = root.querySelector<HTMLElement>(`[data-spot="${key}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: (r.left - pr.left) / k,
        y: (r.top - pr.top) / k,
        w: r.width / k,
        h: r.height / k,
        r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12,
      };
    };

    const sr = rel(keysRef.current.spot);
    const tr = rel(keysRef.current.tap);
    setSpotRect((prev) => (sameRect(prev, sr) ? prev : sr));
    setTapRect((prev) => (sameRect(prev, tr) ? prev : tr));
    if (sr) {
      lastSpotRef.current = sr;
      setLastSpot((prev) => (prev === sr || sameRect(prev, sr) ? prev : sr));
    }

    const hl = root.querySelector<HTMLElement>('[data-hl]');
    if (hl) {
      const h = hl.offsetHeight;
      if (hl.hasAttribute('data-compact')) compactHRef.current = h;
      else fullHRef.current = h;
      setHlH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    }

    const a = root.querySelector<HTMLElement>('[data-chat-area],[data-tut-scroll-area]');
    const c = root.querySelector<HTMLElement>('[data-chat-content],[data-tut-scroll-content]');
    if (a && c) {
      const m = Math.max(0, c.offsetHeight - a.clientHeight);
      setChatMax((prev) => (Math.abs(prev - m) > 1 ? m : prev));
    }

    // Auto-scroll: if the target sits inside a scrolling area but outside its
    // visible part (a tall card pushed under the header, a row under the tab
    // bar), nudge the area so it lands inside. It works from the target's
    // position with the area's *current* translation removed, so it stays
    // stable while the area's own transition runs.
    let want = 0;
    const key = keysRef.current.spot;
    const tgt = key ? root.querySelector<HTMLElement>(`[data-spot="${key}"]`) : null;
    if (sr && a && c && tgt && c.contains(tgt)) {
      const ar = a.getBoundingClientRect();
      const aT = (ar.top - pr.top) / k;
      const aB = (ar.bottom - pr.top) / k;
      // A target taller than the visible area (Chat 1's invoice card on a short
      // stage) can't be fully inside: pin its top below the header and never
      // scroll it up for the bottom edge.
      const fits = sr.h + 16 <= aB - aT;
      const applied = new DOMMatrix(getComputedStyle(c).transform).m42;
      const base = Number(c.dataset.tutBase) || 0;
      const yb = sr.y - applied + base;
      const M = 8;
      let total = base;
      if (yb < aT + M) total = base + (aT + M - yb);
      else if (fits && yb + sr.h + M > aB) total = base - Math.min(yb + sr.h + M - aB, yb - (aT + M));
      // Keep the content covering the area: with overflow the translation may
      // range from "bottom edge flush" to "top edge flush", whichever way the
      // area aligns its content (top for a ready chat, bottom while it fills).
      const offset0 = (c.getBoundingClientRect().top - ar.top) / k - applied;
      const over = c.offsetHeight - a.clientHeight;
      const lo = over > 0 ? -over - offset0 : base;
      const hi = over > 0 ? -offset0 : base;
      want = Math.min(hi, Math.max(lo, total)) - base;
    }
    setNudge((prev) => (Math.abs(prev - want) > 0.5 ? want : prev));
  }, []);

  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      measure();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [measure]);

  // The dim scrim is an SVG evenodd path whose rounded-rect hole follows the
  // gold ring frame by frame (the ring's own CSS transition drives both, so the
  // two can never drift apart). A path, not a giant box-shadow: no spread to
  // size and no tiling seam on iOS.
  const scrimRef = useRef<SVGPathElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const ring = ringRef.current;
      const path = scrimRef.current;
      if (!ring || !path) return;
      const cs = getComputedStyle(ring);
      const x = parseFloat(cs.left) || 0;
      const y = parseFloat(cs.top) || 0;
      const w = parseFloat(cs.width) || 0;
      const h = parseFloat(cs.height) || 0;
      const rr = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
      const d =
        `M-2 -2H${frameW + 2}V${frameH + 2}H-2Z` +
        `M${x + rr} ${y}H${x + w - rr}A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}V${y + h - rr}` +
        `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}` +
        `V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`;
      if (d !== last) {
        last = d;
        path.setAttribute('d', d);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [frameH, frameW]);

  // Remember what opened the tutorial (the pill, a picker item) so focus can go
  // back to it on close. Captured before the effect below moves focus in.
  const openerRef = useRef<HTMLElement | null>(null);
  const wideRef = useRef(false);
  wideRef.current = wide;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useLayoutEffect(() => {
    // (Dev StrictMode re-runs this once focus is already inside the dialog; keep
    // the first capture then.)
    const a = document.activeElement;
    if (a instanceof HTMLElement && !rootRef.current?.contains(a)) openerRef.current = a;
  }, []);

  // Wide screens only (phones are untouched): the app behind must not scroll
  // (wheel, touch), be reached by Tab, or be seen by assistive tech while the
  // tutorial is open. Everything outside the dialog is made inert and restored on
  // close; Tab/Shift+Tab cycle inside the dialog; Esc skips even if focus was lost.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !wide) return;
    const stop = (e: Event) => e.preventDefault();
    root.addEventListener('wheel', stop, { passive: false });
    root.addEventListener('touchmove', stop, { passive: false });

    const inerted: HTMLElement[] = [];
    for (let node: HTMLElement = root; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib === node || !(sib instanceof HTMLElement) || sib.hasAttribute('inert')) continue;
        sib.setAttribute('inert', '');
        inerted.push(sib);
      }
    }

    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"])')).filter(
        (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
      );
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        (e.key === 'ArrowRight' ? goNextRef : goBackRef).current();
        return;
      }
      // Enter steps on too, unless it is activating a focused control.
      if (e.key === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) {
        e.preventDefault();
        goNextRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      e.preventDefault();
      if (!list.length) {
        root.focus();
        return;
      }
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : i === -1 || i === list.length - 1 ? 0 : i + 1;
      list[next].focus();
    };
    document.addEventListener('keydown', onKey);
    root.focus();

    return () => {
      root.removeEventListener('wheel', stop);
      root.removeEventListener('touchmove', stop);
      document.removeEventListener('keydown', onKey);
      for (const el of inerted) el.removeAttribute('inert');
    };
  }, [wide]);

  // On close, give focus back to what opened the tutorial. Declared after the
  // effect above so its cleanup (which lifts inert) has already run.
  useEffect(
    () => () => {
      const opener = openerRef.current;
      if (wideRef.current && opener && opener.isConnected) opener.focus({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    const mq = window.matchMedia(REAL_PHONE);
    const on = () => setRealPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // The framed phone on a wide screen drops the fake status bar too (nothing real
  // sits above it, and the 47px lets Chat 1's invoice card clear the compact card).
  const sbH = laptop ? 0 : realPhone || wide ? SB_H : 0;

  const goNext = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    setSceneIndex((i) => i + 1);
  }, [isLast, onClose]);

  const goBack = useCallback(() => {
    if (sceneIndex === 0) return;
    setSceneIndex((i) => i - 1);
  }, [sceneIndex]);

  const skip = useCallback(() => onClose(), [onClose]);

  // Focus the dialog so keyboard users land inside it; Escape skips (same
  // outcome as the Skip control, and it still marks the tab seen).
  useEffect(() => {
    rootRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      skip();
    }
  };

  const r = state.spotKey ? spotRect : null;
  const lr = r || lastSpot || lastSpotRef.current || { x: frameW / 2, y: frameH / 2, w: 0, h: 0, r: 12 };
  const pad = 6;
  const sw = lr.w + pad * 2;
  const sh = lr.h + pad * 2;
  goNextRef.current = goNext;
  goBackRef.current = goBack;

  // Placement solver. The headline card and Next are one cluster (card, 12px gap,
  // Next), parked at the top or the bottom of the stage (above the tab bar) so it
  // never covers the spotlight. If neither slot is clear the compact cluster is
  // used: title, one-line subtitle, and Next as a small pill inside the card.
  // Laptop: the design spaces the card 18px off the spotlight ring. Stage pixels
  // are scaled by --tut-scale, so the design's rendered values divide by it.
  const GAP = wide ? 18 / scale : 12;
  const NEXT_H = 58;
  // Laptop: the cluster parks under the 72px page header and above the footer.
  const TOP = laptop ? 96 : 54 - sbH;
  const CLUSTER_BOTTOM = laptop ? frameH - 40 : stageH - 84 - 14;
  const y1 = r ? r.y - 8 : 0;
  const y2 = r ? r.y + r.h + 8 : 0;
  const ov = (a: number, c: number) => (r ? Math.max(0, Math.min(y2, c) - Math.max(y1, a)) : 0);
  const choose = (ch: number) => {
    const botY = CLUSTER_BOTTOM - ch;
    const oT = ov(TOP, TOP + ch);
    const oB = ov(botY, botY + ch);
    let slot = lastSlotRef.current;
    if (r) {
      if (oT === 0 && oB === 0) slot = (y1 + y2) / 2 > frameH / 2 ? 'top' : 'bot';
      else slot = oT <= oB ? 'top' : 'bot';
    }
    return { slot, y: slot === 'top' ? TOP : botY, overlap: slot === 'top' ? oT : oB };
  };
  // Laptop: the design's Next is a 91x36 pill inside the card's footer row, so the
  // cluster is the card alone (its measured height already holds the pill).
  const fullCh = fullHRef.current + (laptop ? 0 : GAP + NEXT_H);
  let place = choose(fullCh);
  // The compact cluster is a phone device: the design's laptop card is always the
  // full one (its 159px two-line card), so only the phone falls back.
  const compact = !wide && !!r && place.overlap > 0;
  if (compact) place = choose(compactHRef.current);
  lastSlotRef.current = place.slot;
  const H = compact ? compactHRef.current : fullHRef.current;
  const hlTop = place.y;
  const nextTop = hlTop + H + GAP;
  const tapX = tapRect ? tapRect.x + tapRect.w / 2 : 0;
  const tapY = tapRect ? tapRect.y + tapRect.h / 2 : 0;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${tutorial.name} tutorial`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={styles.root}
      // On wide screens the root is an opaque dark backdrop (none of the real app
      // shows through) that blocks the app's pointer and scroll input; a tap on it
      // does nothing. Phones keep the cream root.
      style={
        wide
          ? {
              outline: 'none',
              background: 'radial-gradient(ellipse at 50% 40%, #2b241b 0%, #14110c 70%)',
              overscrollBehavior: 'contain',
              touchAction: 'none',
            }
          : { outline: 'none' }
      }
    >
      <div ref={safeRef} className={styles.safeArea}>
        <div
          ref={stageRef}
          className={styles.stage}
          style={
            {
              '--tut-scale': scale,
              '--tut-h': `${frameH}px`,
              width: frameW,
              // Device frame on wide screens: rounded corners, hairline, soft shadow.
              ...(wide
                ? {
                    borderRadius: 40,
                    boxShadow: '0 0 0 1px rgba(255,255,255,.16), 0 40px 90px rgba(0,0,0,.6)',
                  }
                : null),
            } as React.CSSProperties
          }
        >
          {/* The mocks lay out as a stage sbH taller than the viewport, pinned to the
              bottom; the extra top strip (the fake status bar) is clipped away.
              Laptop stage (>= 1280): the same mock sits inside the design's
              288 / 1152 / 72 shell. */}
          {laptop ? (
            <LaptopShell tab={tab}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                <MockScreen state={state} chatMax={chatMax} nudge={nudge} laptop />
              </div>
            </LaptopShell>
          ) : (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: -sbH }}>
              <MockScreen state={state} chatMax={chatMax} nudge={nudge} />
            </div>
          )}

        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div key={sceneIndex} className={styles.aVeil} style={{ position: 'absolute', inset: 0, background: '#FDF7EE', pointerEvents: 'none' }} />

        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: frameW,
            height: frameH,
            opacity: r && state.st.dim !== false ? 1 : 0,
            transition: 'opacity .4s',
            pointerEvents: 'none',
          }}
        >
          <svg width={frameW} height={frameH} style={{ display: 'block' }}>
            <path ref={scrimRef} fillRule="evenodd" fill="rgba(22,18,12,0.6)" />
          </svg>
        </div>

        <div
          ref={ringRef}
          data-tut-ring
          aria-hidden
          style={{
            position: 'absolute',
            left: lr.x - pad,
            top: lr.y - pad,
            width: sw,
            height: sh,
            borderRadius: Math.min(lr.r + pad, sh / 2),
            opacity: r ? 1 : 0,
            transition:
              'left .55s cubic-bezier(.2,.8,.2,1), top .55s cubic-bezier(.2,.8,.2,1), width .55s cubic-bezier(.2,.8,.2,1), height .55s cubic-bezier(.2,.8,.2,1), border-radius .55s, opacity .4s',
            pointerEvents: 'none',
          }}
        >
          <div
            className={styles.aRing}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              border: '2px solid #E6C65A',
              boxShadow: '0 0 18px rgba(230,198,90,.55)',
            }}
          />
        </div>

        {tapRect && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: tapX,
              top: tapY,
              width: 0,
              height: 0,
              transition: 'left .35s cubic-bezier(.3,.7,.3,1), top .35s cubic-bezier(.3,.7,.3,1)',
              pointerEvents: 'none',
            }}
          >
            <span className={styles.aRipple15} style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 22, border: '2px solid #E6C65A' }} />
            <span className={styles.aRipple35} style={{ position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 22, border: '2px solid #E6C65A' }} />
            <span className={styles.aPress} style={{ position: 'absolute', left: -17, top: -17, width: 34, height: 34, borderRadius: 17, background: 'rgba(255,252,244,.85)', border: '2px solid #fff', boxShadow: '0 6px 16px rgba(20,16,10,.35)' }} />
          </div>
        )}

        {/* Laptop renders Next inside the callout card (see the card's footer row), so
            the full-width bar stays a phone/iPad device. */}
        {(finished || wide) && !compact && !laptop && (
          <button
            type="button"
            onClick={goNext}
            aria-label={isLast ? 'Got it, finish tutorial' : 'Next scene'}
            aria-keyshortcuts="ArrowRight Enter"
            className={`${styles.unbutton} ${styles.aNext} ${styles.focusGold}`}
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              top: nextTop,
              height: 58,
              borderRadius: 29,
              background: '#D4AF37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: '800 19px/1 var(--font-montserrat)',
              letterSpacing: '.01em',
              color: '#1E1A14',
              boxShadow:
                '0 14px 30px -8px rgba(20,16,10,.55),0 0 18px rgba(230,198,90,.35),0 0 0 0 rgba(230,198,90,.6)',
              transition: 'top .4s cubic-bezier(.65,0,.35,1)',
            }}
          >
            {isLast ? 'Got it' : 'Next →'}
          </button>
        )}

        <div
          key={sceneIndex}
          data-hl
          data-compact={compact ? '' : undefined}
          className={styles.aHl}
          aria-live="polite"
          style={{
            position: 'absolute',
            // Laptop (design gallery): a fixed 360 card, 16px off the frame's
            // sides; the phone keeps its full-width card.
            ...(wide
              ? { left: '50%', right: 'auto', width: 360 / scale, marginLeft: -180 / scale }
              : { left: 14, right: 14 }),
            top: hlTop,
            transition: 'top .6s cubic-bezier(.65,0,.35,1)',
            background: '#1E1A15',
            borderRadius: wide ? 20 : 24,
            padding: compact ? '12px 16px 14px' : wide ? '16px 18px' : '14px 18px 18px',
            boxShadow: '0 18px 50px rgba(20,16,10,.35), inset 0 0 0 1px rgba(255,255,255,.07)',
            color: '#FFF8EC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                font: '700 11.5px/1 var(--font-inter)',
                letterSpacing: '.14em',
                color: '#E6C65A',
                whiteSpace: 'nowrap',
              }}
            >
              {tutorial.name.toUpperCase()} · {sceneIndex + 1}/{tutorial.scenes.length}
            </span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginRight: 'auto' }}>
              {tutorial.scenes.map((s, j) => (
                <span
                  key={j}
                  style={{
                    position: 'relative',
                    display: 'block',
                    width: j === sceneIndex ? 26 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: j < sceneIndex ? '#E6C65A' : 'rgba(255,248,236,.22)',
                    overflow: 'hidden',
                    transition: 'width .4s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${j === sceneIndex ? Math.min(100, (t / sceneDuration(s)) * 100) : 0}%`,
                      background: '#E6C65A',
                    }}
                  />
                </span>
              ))}
            </div>
            {sceneIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                aria-label="Previous scene"
                aria-keyshortcuts="ArrowLeft"
                className={`${styles.unbutton} ${styles.focusGold}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  display: 'grid',
                  placeItems: 'center',
                  color: '#A59C8C',
                  font: '20px/1 var(--font-inter)',
                }}
              >
                <span style={{ display: 'flex', transform: 'rotate(180deg)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M9.3 6.7a1 1 0 0 0-1.4 1.4l3.9 3.9-3.9 3.9a1 1 0 1 0 1.4 1.4l4.6-4.6a1 1 0 0 0 0-1.4L9.3 6.7Z" />
                  </svg>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={skip}
              className={`${styles.unbutton} ${styles.focusGold}`}
              style={{
                padding: '7px 12px',
                borderRadius: 99,
                background: 'rgba(255,248,236,.1)',
                font: '600 13.5px/1 var(--font-inter)',
                color: '#E9E1D2',
              }}
            >
              Skip
            </button>
          </div>
          {state.badge && !compact && (
            <span
              style={{
                display: 'inline-block',
                marginTop: 12,
                padding: '5px 10px',
                borderRadius: 8,
                background: '#D4AF37',
                font: '800 11.5px/1 var(--font-inter)',
                letterSpacing: '.1em',
                color: '#2A2410',
              }}
            >
              {state.badge}
            </span>
          )}
          {compact ? (
            <>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    font: '800 21px/1.15 var(--font-montserrat)',
                    letterSpacing: '-.015em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {scene.h}
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  tabIndex={finished ? 0 : -1}
                  aria-hidden={!finished}
                  aria-label={isLast ? 'Got it, finish tutorial' : 'Next scene'}
                  className={`${styles.unbutton} ${styles.focusGold}`}
                  style={{
                    flex: 'none',
                    visibility: finished ? 'visible' : 'hidden',
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 18,
                    background: '#D4AF37',
                    font: '800 15px/1 var(--font-montserrat)',
                    color: '#1E1A14',
                  }}
                >
                  {isLast ? 'Got it' : 'Next →'}
                </button>
              </div>
              <div
                style={{
                  marginTop: 4,
                  font: '500 14px/1.3 var(--font-inter)',
                  color: '#DCD3C3',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {state.hlSub}
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  marginTop: 10,
                  font: '800 27px/1.1 var(--font-montserrat)',
                  letterSpacing: '-.015em',
                  textWrap: 'balance',
                }}
              >
                {scene.h}
              </div>
              <div
                style={{
                  marginTop: 7,
                  font: '500 15.5px/1.38 var(--font-inter)',
                  color: '#DCD3C3',
                  textWrap: 'pretty',
                }}
              >
                {state.hlSub}
              </div>
            </>
          )}
          {/* Laptop (design gallery): the card's footer row, Next at its right end —
              36 tall, radius 999, 18 from the card's sides via the card's padding.
              Same label logic and click as the phone's bar, same nextPulse. */}
          {laptop && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={goNext}
                aria-label={isLast ? 'Got it, finish tutorial' : 'Next scene'}
                aria-keyshortcuts="ArrowRight Enter"
                className={`${styles.unbutton} ${styles.aNext} ${styles.focusGold}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 36,
                  padding: '0 18px',
                  borderRadius: 999,
                  background: '#D4AF37',
                  font: '800 14.5px/1 var(--font-montserrat)',
                  color: '#1F1B13',
                }}
              >
                {isLast ? 'Got it' : 'Next →'}
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
    </div>
  );
}

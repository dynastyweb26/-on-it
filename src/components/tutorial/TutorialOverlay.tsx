'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TutorialTab } from '@/lib/tutorial-seen';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import { TUTORIALS } from './data';
import { deriveScene, sceneDuration } from './player-state';
import { MockScreen } from './mock/MockScreen';
import styles from './tutorial.module.css';

type Rect = { x: number; y: number; w: number; h: number; r: number };

// The stage is 390 wide; its height flexes with the viewport (844 on the prototype's phone).
const STAGE_W = 390;
const PROTO_H = 844;
// The mock's fake status bar (9:41, signal, wifi) is 47 tall. On a real phone the
// real one is already there, so the mock slides up under the top edge instead.
const SB_H = 47;
const REAL_PHONE = '(max-width: 500px), (pointer: coarse)';
// Shortest stage (fake status bar included) at which all 20 scenes keep their
// spotlight on screen, uncovered by the header, tab bar, headline card and Next.
// Measured at 390 wide with the status bar hidden: every scene fits at 820 tall (832 leaves room for the ring);
// Chat 1's invoice card (the tallest target) still collides with even the
// compact card at 815. Below this the stage scales down instead of squeezing,
// and the side gutters show the overlay backdrop.
const MIN_STAGE_H = 832 + SB_H;

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
  const [realPhone, setRealPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REAL_PHONE).matches,
  );
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [tapRect, setTapRect] = useState<Rect | null>(null);
  const [lastSpot, setLastSpot] = useState<Rect | null>(null);
  const [hlH, setHlH] = useState(150);
  const [chatMax, setChatMax] = useState(0);
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
  const scene = tutorial.scenes[sceneIndex];
  const duration = sceneDuration(scene);
  const state = deriveScene(tab, scene, t);
  const isLast = sceneIndex === tutorial.scenes.length - 1;
  const finished = t >= duration;

  // The prototype's 390-wide phone screen, scaled by width to the real viewport;
  // the stage then grows or shrinks in height to fill what is left, so there are
  // no bars. When that would leave it shorter than MIN_STAGE_H it scales by
  // height instead and the backdrop fills the side gutters. At 390 × 844 the
  // scale is exactly 1 and the stage is exactly 844.
  useLayoutEffect(() => {
    const update = () => {
      const el = safeRef.current;
      if (!el) return;
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!(w > 0) || !(h > 0)) return;
      const minH = MIN_STAGE_H - (window.matchMedia(REAL_PHONE).matches ? SB_H : 0);
      const k = Math.min(w / STAGE_W, h / minH);
      setScale(k);
      setStageH(h / k);
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
  }, []);

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
    const k = pr.width / STAGE_W || 1;
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

    const a = root.querySelector<HTMLElement>('[data-chat-area]');
    const c = root.querySelector<HTMLElement>('[data-chat-content]');
    if (a && c) {
      const m = Math.max(0, c.offsetHeight - a.clientHeight);
      setChatMax((prev) => (Math.abs(prev - m) > 1 ? m : prev));
    }
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
        `M-2 -2H${STAGE_W + 2}V${stageH + 2}H-2Z` +
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
  }, [stageH]);

  useEffect(() => {
    const mq = window.matchMedia(REAL_PHONE);
    const on = () => setRealPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const sbH = realPhone ? SB_H : 0;

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
  const lr = r || lastSpot || lastSpotRef.current || { x: STAGE_W / 2, y: stageH / 2, w: 0, h: 0, r: 12 };
  const pad = 6;
  const sw = lr.w + pad * 2;
  const sh = lr.h + pad * 2;
  // Placement solver. The headline card and Next are one cluster (card, 12px gap,
  // Next), parked at the top or the bottom of the stage (above the tab bar) so it
  // never covers the spotlight. If neither slot is clear the compact cluster is
  // used: title, one-line subtitle, and Next as a small pill inside the card.
  const GAP = 12;
  const NEXT_H = 58;
  const TOP = 54 - sbH;
  const CLUSTER_BOTTOM = stageH - 84 - 14;
  const y1 = r ? r.y - 8 : 0;
  const y2 = r ? r.y + r.h + 8 : 0;
  const ov = (a: number, c: number) => (r ? Math.max(0, Math.min(y2, c) - Math.max(y1, a)) : 0);
  const choose = (ch: number) => {
    const botY = CLUSTER_BOTTOM - ch;
    const oT = ov(TOP, TOP + ch);
    const oB = ov(botY, botY + ch);
    let slot = lastSlotRef.current;
    if (r) {
      if (oT === 0 && oB === 0) slot = (y1 + y2) / 2 > stageH / 2 ? 'top' : 'bot';
      else slot = oT <= oB ? 'top' : 'bot';
    }
    return { slot, y: slot === 'top' ? TOP : botY, overlap: slot === 'top' ? oT : oB };
  };
  const fullCh = fullHRef.current + GAP + NEXT_H;
  let place = choose(fullCh);
  const compact = !!r && place.overlap > 0;
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
      style={{ outline: 'none' }}
    >
      <div ref={safeRef} className={styles.safeArea}>
        <div
          ref={stageRef}
          className={styles.stage}
          style={{ '--tut-scale': scale, '--tut-h': `${stageH}px` } as React.CSSProperties}
        >
          {/* The mocks lay out as a stage sbH taller than the viewport, pinned to the
              bottom; the extra top strip (the fake status bar) is clipped away. */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: -sbH }}>
            <MockScreen state={state} chatMax={chatMax} />
          </div>

        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <div key={sceneIndex} className={styles.aVeil} style={{ position: 'absolute', inset: 0, background: '#FDF7EE', pointerEvents: 'none' }} />

        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: STAGE_W,
            height: stageH,
            opacity: r && state.st.dim !== false ? 1 : 0,
            transition: 'opacity .4s',
            pointerEvents: 'none',
          }}
        >
          <svg width={STAGE_W} height={stageH} style={{ display: 'block' }}>
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

        {finished && !compact && (
          <button
            type="button"
            onClick={goNext}
            aria-label={isLast ? 'Got it, finish tutorial' : 'Next scene'}
            className={`${styles.unbutton} ${styles.aNext}`}
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
            left: 14,
            right: 14,
            top: hlTop,
            transition: 'top .6s cubic-bezier(.65,0,.35,1)',
            background: '#1E1A15',
            borderRadius: 24,
            padding: compact ? '12px 16px 14px' : '14px 18px 18px',
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
                className={styles.unbutton}
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
              className={styles.unbutton}
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
                  className={styles.unbutton}
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
        </div>
        </div>
      </div>
    </div>
    </div>
  );
}

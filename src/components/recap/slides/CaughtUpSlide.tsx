'use client';
// Slide 5 (variant) — All caught up (RECAP-SPEC §5 "caughtUp"; the prototype's
// slides.js caughtUp), dark, when nothing is owed: the period's paid invoices
// as a bundle — up to three cards fly in fanned (bottom card first) and each
// gets a green PAID stamp slammed on with a little dip; the rest are up to six
// stacked edges that ripple green; the fan squares up; a gold band wraps the
// bundle (snap), a cream swoosh pops on it and a glint crosses it; "+N more
// paid". Then "You're all caught up." / "Nobody owes you a dime." / "Make an
// invoice" and the closing line. The band lands within ~3 s at any count
// (≤ 3 cards and ≤ 6 edges are animated; the rest is the pill).
//
// Layout: a flow column (not the prototype's absolute 393 × 852 positions) so
// the short-screen fit applies; the bundle keeps the prototype's geometry.
//
// Reduce Motion: cards, stamps, band and text fade in at rest; no fan, dip,
// ripple, square-up or glint.
import { useRef } from 'react';
import { useSlideAnims } from '@/components/recap/anim';
import type { SlideProps } from '@/components/recap/clock';
import { money, per, plural, shortDate } from '@/components/recap/copy';
import { fitContent } from '@/components/recap/fit';

const FAN = [{ x: -12, y: -8, r: -7 }, { x: 16, y: 6, r: 6 }, { x: -8, y: 14, r: -3 }];
const SQR = [0, 0.8, -0.6];         // the squared-up bundle's tiny resting offsets
const SUCCESS = '#2e6b3f';

export default function CaughtUpSlide({ payload: d, timing, clock, reduced, onAction }: SlideProps) {
  const full = d.paid.invoices.slice(0, 3);
  const nF = full.length;
  const n = d.paid.count;
  const rest = Math.max(0, n - nF);
  const layers = Math.min(6, rest);
  // Bundle box: the 170 px cards + their stagger + the edges + the pill.
  const bundleH = nF ? 170 + (nF - 1) * 4 + layers * 4 + (rest ? 18 + 30 : 0) : 0;

  const boxRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const edgeORefs = useRef<(HTMLDivElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bandBarRef = useRef<HTMLDivElement>(null);
  const bandMarkRef = useRef<HTMLImageElement>(null);
  const glintRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef<HTMLDivElement>(null);

  useSlideAnims(clock, timing.B, reduced, (S) => {
    fitContent(boxRef.current);
    S.fadeUp(labelRef.current, 'label');
    S.fadeUp(capRef.current, 'caption');
    edgeORefs.current.forEach((o, j) => {
      if (!o) return;
      S.anim(o, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], 'edges', { i: j });
      S.anim(o.firstElementChild, [{ transform: `translateY(${j * 3}px) rotate(${j % 2 ? 2 : -2}deg)` }, { transform: 'none' }], 'square', { kind: 'move' });
      S.anim(o.firstElementChild, [
        { borderBottomColor: 'rgba(46,107,63,0)', boxShadow: '0 8px 14px -10px rgba(0,0,0,.8)' },
        { offset: 0.5, boxShadow: '0 0 16px rgba(140,220,160,.85), 0 8px 14px -10px rgba(0,0,0,.8)' },
        { borderBottomColor: SUCCESS, boxShadow: '0 8px 14px -10px rgba(0,0,0,.8)' },
      ], 'ripple', { i: j, kind: 'move' });
    });
    cardRefs.current.forEach((o, i) => {
      if (!o) return;
      const k = nF - 1 - i, F = FAN[i];   // the bottom card lands + stamps first, the top card last
      S.anim(o.querySelector('.rc-pc-in'), [{ opacity: 0, transform: 'translateX(320px) rotate(10deg)' }, { opacity: 1, transform: 'none' }], 'cards', { i: k });
      S.anim(o.querySelector('.rc-stamp'), [{ opacity: 0, transform: 'scale(1.9)' }, { opacity: 1, transform: 'none' }], 'stamp', { i: k });
      S.anim(o.querySelector('.rc-pc-dip'), [{ transform: 'none' }, { offset: 0.4, transform: 'translateY(3px)' }, { transform: 'none' }], 'stamp', { i: k, offset: 110, dur: 260, kind: 'move', ease: 'out' });
      S.anim(o, [{ transform: `translate(${F.x}px,${F.y}px) rotate(${F.r}deg)` }, { transform: 'none' }], 'square', { kind: 'move' });
    });
    S.anim(shadowRef.current, [{ opacity: 0.5 }, { opacity: 1 }], 'square', { kind: 'move' });
    if (nF) {
      S.anim(bandBarRef.current, [{ transform: 'scaleX(0)' }, { transform: 'none' }], 'band');
      S.pop(bandMarkRef.current, 'mark');
      S.anim(glintRef.current, [{ opacity: 1, transform: 'translateX(-90px) skewX(-18deg)' }, { opacity: 1, transform: 'translateX(380px) skewX(-18deg)' }], 'glint', { kind: 'fx' });
    }
    S.pop(moreRef.current, 'more');
    S.fadeUp(titleRef.current, 'title', { dy: 14 });
    S.fadeUp(bodyRef.current, 'body');
    S.fadeUp(ctaRef.current, 'cta', { dy: 14 });
    S.fadeUp(closingRef.current, 'closing');
  });

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="rc-content">
        <div ref={labelRef} className="rc-label">Still on the table</div>
        <div ref={capRef} className="rc-cucap">{n ? `${plural(n, 'invoice', 'invoices')} paid · ${money(d.paid.total)}` : 'Nothing outstanding'}</div>
        {nF > 0 && (
          <div className="rc-bundle-wrap" style={{ height: bundleH }}>
            <div className="rc-bundle">
              <div ref={shadowRef} className="rc-bundle-shadow" />
              {Array.from({ length: layers }, (_, j) => (
                <div key={`e${j}`} ref={(el) => { edgeORefs.current[j] = el; }} className="rc-pe-o" style={{ zIndex: 4 - j }}>
                  <div className="rc-pedge" style={{ top: (nF - 1) * 4 + (j + 1) * 4, background: `hsl(36,${30 - j * 2}%,${86 - j * 6}%)` }} />
                </div>
              ))}
              {full.map((x, i) => (
                <div key={i} ref={(el) => { cardRefs.current[i] = el; }} className="rc-pc-outer" style={{ zIndex: 10 - i }}>
                  <div className="rc-pc-in"><div className="rc-pc-dip">
                    <div className="rc-pc" style={{ transform: `translateY(${i * 4}px) rotate(${SQR[i]}deg)` }}>
                      <small>Invoice · {shortDate(x.date)}</small>
                      <span>{x.client}</span>
                      <b>{money(x.amount)}</b>
                      <div className="rc-stamp"><div>PAID</div></div>
                    </div>
                  </div></div>
                </div>
              ))}
              <div className="rc-band" style={{ top: 63 + (nF - 1) * 2 }}>
                <div ref={bandBarRef} className="rc-band-bar"><div ref={glintRef} className="rc-glint" /></div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={bandMarkRef} className="rc-band-mark" src="/recap/swoosh-cream.svg" alt="" draggable={false} />
              </div>
              {rest > 0 && (
                <div ref={moreRef} className="rc-pmore" style={{ top: 170 + (nF - 1) * 4 + layers * 4 + 18 }}>
                  <span>+{rest} more paid</span>
                </div>
              )}
            </div>
          </div>
        )}
        <h2 ref={titleRef} className="rc-h2 rc-cu-t">You’re all caught up.</h2>
        <p ref={bodyRef} className="rc-body">Nobody owes you a dime.</p>
        <div className="rc-spacer" />
        <div ref={ctaRef} className="rc-cta">
          <button type="button" className="rc-btn" data-act="new-invoice" onClick={() => onAction('new-invoice')}>Make an invoice</button>
        </div>
        <div ref={closingRef} className="rc-closing">Go get it this {per(d)}.</div>
      </div>
    </div>
  );
}

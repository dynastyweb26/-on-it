// The affirmation's lines, brush and diamond divider, drawn from an affLayout()
// result with the design's own styles and timings (RecapPlayer.dc.html "10
// AFFIRMATION": data-a up on every word, wipe on the brush, gx on the divider).
// `animate` is false in the share image, which is a still.
import type { CSSProperties } from 'react';
import { s } from '@/components/recap/design/css';
import type { AffLayout, AffLine, AffSeg } from '@/components/recap/design/aff-layout';

const MF = 'var(--onit-display)';

const lineStyle = (l: AffLine): CSSProperties => ({ display: 'flex', justifyContent: 'center', alignItems: 'baseline', columnGap: l.gap, whiteSpace: 'nowrap' });
const segStyle = (g: AffSeg, l: AffLine, L: AffLayout): CSSProperties => {
  const key = g.k >= 0;
  return {
    position: 'relative', display: 'inline-flex', alignItems: 'baseline', columnGap: l.gap,
    font: `${key ? 800 : 600} ${key ? L.K : L.P2}px/${l.lh}px ${MF}`,
    letterSpacing: key ? '-.02em' : '-.01em', color: key ? '#1f1b13' : '#3b3527',
  };
};

export function AffText({ layout: L, animate, field = false }: { layout: AffLayout; animate: boolean; field?: boolean }) {
  const a = (d: number, dur: number, kind: string) => (animate ? { 'data-a': kind, 'data-d': d, 'data-dur': dur } : {});
  return (
    <div {...(field ? { 'data-f': 'affirmation_text' } : {})} style={s('display:flex;flex-direction:column;align-items:center;width:100%;color:#1f1b13')}>
      {L.lines.map((l, i) => (
        <div key={i} style={lineStyle(l)}>
          {l.segs.map((g, j) => (
            <span key={j} style={segStyle(g, l, L)}>
              {g.under && (
                <span {...a(g.ud, 700, 'wipe')} style={s('position:absolute;left:-6%;width:112%;bottom:-.07em;height:.2em;z-index:0;pointer-events:none;transform:rotate(-1.4deg)')}>
                  <i style={s('position:absolute;left:0;right:0;top:0;height:.13em;border-radius:50%;background:linear-gradient(90deg,rgba(212,175,55,0),#d4af37 14%,#c9a42c 62%,#dcb94a 86%,rgba(220,185,74,0))')} />
                  <i style={s('position:absolute;left:16%;right:6%;top:.1em;height:.05em;border-radius:50%;background:linear-gradient(90deg,rgba(212,175,55,0),rgba(201,164,44,.7) 30%,rgba(212,175,55,0))')} />
                </span>
              )}
              {g.words.map((w, k) => (
                <span key={k} {...a(w.d, 420, 'up')} style={s('position:relative;z-index:1')}>{w.w}</span>
              ))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AffDivider({ d, animate }: { d: number; animate: boolean }) {
  return (
    <div {...(animate ? { 'data-a': 'gx', 'data-d': d, 'data-dur': 500 } : {})} style={s('margin-top:26px;display:flex;align-items:center;gap:9px;transform-origin:center')}>
      <i style={s('display:block;width:30px;height:1.5px;border-radius:999px;background:linear-gradient(90deg,rgba(212,175,55,0),#d4af37)')} />
      <i style={s('display:block;width:6px;height:6px;background:#d4af37;transform:rotate(45deg)')} />
      <i style={s('display:block;width:30px;height:1.5px;border-radius:999px;background:linear-gradient(90deg,#d4af37,rgba(212,175,55,0))')} />
    </div>
  );
}

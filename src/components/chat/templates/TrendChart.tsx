'use client';
// chart.trend — design/ai-templates/TrendChart.dc.html. The SVG is the file's
// chart() with its constants. Shaping, the one-point fallback, the over-spend
// line and the readout come from src/lib/templates/trend.ts.
import { useEffect, useRef, useState } from 'react';
import { Eyebrow, MONO, Sym, TryAgain } from './shared';
import StatTiles from './StatTiles';
import { fmtMoney, overSpentPeriods, selectedPoint, trendReadout, trendView } from '@/lib/templates/trend';
import type { TrendChartProps, TrendPoint } from '@/lib/templates/props';
import './templates.css';

const MONT = 'var(--font-montserrat), Montserrat, sans-serif';
const INTER = 'var(--font-inter), Inter, sans-serif';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

function Chart({ pts, sel, W, onSel }: { pts: TrendPoint[]; sel: number; W: number; onSel: (i: number) => void }) {
  const H = 170, top = 24, bot = 22, L = 6, R = 6, n = pts.length;
  const mx = Math.max(...pts.flatMap((p) => [p.inc, p.out]), 1);
  const step = Math.pow(10, Math.floor(Math.log10(mx))) / 2;
  const max = Math.ceil(mx / step) * step;
  const pw = W - L - R, ph = H - top - bot, base = top + ph;
  const x = (i: number) => L + (i * pw) / (n - 1);
  const y = (v: number) => top + ph - (v / max) * ph;
  const inc = pts.map((p, i) => [x(i), y(p.inc)]);
  const out = pts.map((p, i) => [x(i), y(p.out)]);
  const ln = (a: number[][]) => 'M' + a.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L');
  const ar = (a: number[][]) => ln(a) + ` L${a[n - 1][0]} ${base} L${a[0][0]} ${base} Z`;

  // The over-spend wedges: where out is above in, closed at the crossings.
  const polys: number[][][][] = [];
  let T: number[][] | null = null, B: number[][] | null = null;
  for (let i = 0; i < n; i++) {
    const d = pts[i].out - pts[i].inc;
    if (d > 0) { if (!T || !B) { T = []; B = []; } T.push(out[i]); B!.push(inc[i]); }
    if (i < n - 1) {
      const d1 = pts[i + 1].out - pts[i + 1].inc;
      if (d > 0 !== d1 > 0) {
        const t = d / (d - d1);
        const c = [x(i) + t * (x(i + 1) - x(i)), y(pts[i].inc + t * (pts[i + 1].inc - pts[i].inc))];
        if (d > 0) { T!.push(c); B!.push(c); polys.push([T!, B!]); T = B = null; } else { T = [c]; B = [c]; }
      }
    }
  }
  if (T && B) polys.push([T, B]);

  const pk = pts.reduce((b, p, i) => (p.inc > pts[b].inc ? i : b), 0);
  const pkx = Math.min(Math.max(x(pk), 34), W - 34);
  const ds = n > 8 ? 7 : 9, colW = pw / (n - 1);
  const label = (i: number, k: number) => (
    <text key={'x' + k} x={x(i)} y={H - 5} fontSize={11} style={{ fill: 'var(--tpl-icon-muted)', fontFamily: INTER }} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>{pts[i].label}</text>
  );
  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Income versus expenses chart">
      <text x={L} y={11} fontSize={10} style={{ fill: 'var(--tpl-icon-muted)', fontFamily: INTER }}>{fmtMoney(max)}</text>
      <line x1={L} x2={W - R} y1={base} y2={base} style={{ stroke: 'var(--tpl-line)' }} />
      <path d={ar(out)} style={{ fill: 'var(--tpl-red)' }} opacity={0.07} />
      <path d={ar(inc)} style={{ fill: 'var(--tpl-chart-in)' }} opacity={0.17} />
      {polys.map(([t, b], k) => (
        <path key={'p' + k} d={ln(t) + ' L' + b.slice().reverse().map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') + ' Z'} style={{ fill: 'var(--tpl-chart-over)' }} opacity={0.24} />
      ))}
      <line x1={x(sel)} x2={x(sel)} y1={top - 6} y2={base} style={{ stroke: 'var(--tpl-chart-gold)' }} strokeDasharray="2 3" />
      <path d={ln(out)} fill="none" style={{ stroke: 'var(--tpl-red)' }} strokeWidth={1.8} strokeDasharray="5 4" />
      <path d={ln(inc)} fill="none" style={{ stroke: 'var(--tpl-chart-in)' }} strokeWidth={2.4} strokeLinejoin="round" />
      <text x={pkx} y={Math.max(inc[pk][1] - 9, 20)} fontSize={11} fontWeight={700} textAnchor="middle" style={{ fill: 'var(--tpl-green)', fontFamily: MONT }}>{fmtMoney(pts[pk].inc).replace('.00', '')}</text>
      {inc.map((q, i) => (
        <rect key={'d' + i} x={q[0] - ds / 2} y={q[1] - ds / 2} width={ds} height={ds} transform={`rotate(45 ${q[0]} ${q[1]})`} style={{ fill: i === sel ? 'var(--tpl-gold)' : 'var(--tpl-card)', stroke: 'var(--tpl-chart-gold)' }} strokeWidth={1.5} />
      ))}
      {[0, Math.floor((n - 1) / 2), n - 1].map((i, k) => label(i, k))}
      {pts.map((_, i) => (
        <rect key={'h' + i} x={x(i) - colW / 2} y={0} width={colW} height={H} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onSel(i)} />
      ))}
    </svg>
  );
}

export default function TrendChart({ state = 'filled', eyebrow, title, points, onRetry }: TrendChartProps & { onRetry?: () => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const [w, setW] = useState(300);
  const boxRef = useRef<HTMLDivElement>(null);
  const view = state === 'filled' ? trendView(points) : null;
  const filled = view?.kind === 'chart';

  // The design measures the box and draws the chart at its width, minus the 8px padding each side.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const upd = () => { const nw = el.clientWidth - 16; if (nw > 0) setW((cur) => (Math.abs(nw - cur) > 1 ? nw : cur)); };
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    upd();
    return () => ro.disconnect();
  }, [filled]);

  const wrap = (children: React.ReactNode) => (
    <div data-template="chart.trend" data-state={state} style={{ width: '100%' }}>{children}</div>
  );
  if (view?.kind === 'fallback') return wrap(<StatTiles eyebrow={eyebrow} title="" tiles={view.tiles} state="filled" />);

  const isEmpty = state === 'empty' || view?.kind === 'empty';
  const shown = view?.kind === 'chart' ? view.points : [];
  const point = selectedPoint(shown, sel);
  const si = point ? shown.indexOf(point) : 0;
  const readout = point ? trendReadout(point) : null;
  const over = overSpentPeriods(shown);

  return wrap(
    <div style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, overflow: 'hidden', fontFamily: INTER, lineHeight: 'normal', color: 'var(--tpl-ink)' }}>
      <div style={{ padding: '16px 16px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 20, lineHeight: 1.2, letterSpacing: '-.01em' }}>{title}</div>
      </div>

      {state === 'loading' && (
        <div style={{ padding: '8px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 140, borderRadius: 12, background: 'var(--tpl-skel-light)' }} />
          <div style={{ height: 10, width: '50%', borderRadius: 5, background: 'var(--tpl-skel)' }} />
        </div>
      )}

      {isEmpty && (
        <div style={{ padding: '0 16px 16px', fontSize: 15, lineHeight: 1.45, color: 'var(--tpl-muted-2)' }}>
          No income or expenses in this period yet. Once money moves, the trend shows here.
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Sym name="error" size={20} color="var(--tpl-red)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Couldn&apos;t load the chart.</div>
              <div style={{ fontSize: 13, color: 'var(--tpl-muted)' }}>Check your connection and try again.</div>
            </div>
          </div>
          <TryAgain onClick={onRetry} />
        </div>
      )}

      {filled && readout && (
        <>
          <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--tpl-muted-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 18, borderTop: '2.5px solid var(--tpl-chart-in)' }} />In</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 18, borderTop: '2px dashed var(--tpl-red)' }} />Out</div>
            <div style={{ flex: 1 }} />
            <div style={{ color: 'var(--tpl-eyebrow)' }}>Tap a point</div>
          </div>
          <div ref={boxRef} style={{ padding: '6px 8px 0', position: 'relative' }}>
            <Chart pts={shown} sel={si} W={w} onSel={setSel} />
          </div>
          {over.labels.length > 0 && (
            <div style={{ padding: '2px 16px 12px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--tpl-red)' }}>
              <Sym name="trending_down" size={17} />
              <span>{over.text}</span>
            </div>
          )}
          <div style={{ borderTop: '1px solid var(--tpl-line)', background: 'var(--tpl-total-bg)', padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--tpl-eyebrow)' }}>{readout.full}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
              {([['In', readout.inc, 'var(--tpl-green)'], ['Out', readout.out, 'var(--tpl-red)'], ['Kept', readout.kept, readout.keptNegative ? 'var(--tpl-red)' : 'var(--tpl-green)']] as const).map(([k, v, c]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--tpl-muted-2)' }}>{k}</div>
                  <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 15, color: c, ...ELLIPSIS }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>,
  );
}

'use client';
// The Books mountain: money in over money out, with Kept on top.
//
// One green for the ridge (#2f6b3f) and a fill-only green (#6f9a78 at 34%);
// spent keeps its alert red as a fill (22%) with a dashed ridge (#b03a29), so
// the two mountains can never be confused at a glance. Kept is a diamond per
// period: filled gold when kept, hollow when the period spent more.
//
// The data is inset 3% from both edges and the first/last points ease in
// (CHANGES.md · C); a peak label that would meet the y-axis shifts right.
// Scrubbing is touch/pointer only and shows the numbers in a card, so nothing
// is read from a 9px label.
import { useMemo, useRef, useState } from 'react';
import { chartTop, easeEnds, peakLabelX, plotX, type ChartPoint } from '@/lib/books-chart';

const W = 360;
const H = 168;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;
const Y_AXIS = 24;

const money = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const signed = (cents: number) => `${cents < 0 ? '−' : ''}${money(Math.abs(cents))}`;

export default function MountainChart({
  points, reduce, unaccounted = 0, onReview,
}: {
  points: ChartPoint[];
  reduce: boolean;
  /** Undecided bank rows: shown as a note, never as chart data. */
  unaccounted?: number;
  onReview?: () => void;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const model = useMemo(() => {
    const collected = easeEnds(points.map((p) => p.collectedCents));
    const spent = easeEnds(points.map((p) => p.spentCents));
    const top = Math.max(1, chartTop([...collected, ...spent]));
    const height = H - PAD_TOP - PAD_BOTTOM;
    const y = (value: number) => PAD_TOP + height - (Math.max(0, value) / top) * height;
    const x = (index: number) => plotX(index, points.length, W);
    const ridge = (values: number[]) => values
      .map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`)
      .join(' ');
    const area = (values: number[]) => `${ridge(values)} L ${x(points.length - 1).toFixed(1)} ${H - PAD_BOTTOM} L ${x(0).toFixed(1)} ${H - PAD_BOTTOM} Z`;
    const maxCollected = collected.indexOf(Math.max(...collected));
    const maxSpent = spent.indexOf(Math.max(...spent));
    return { collected, spent, top, y, x, ridge, area, maxCollected, maxSpent };
  }, [points]);

  const overspent = points.some((point) => point.keptCents < 0);
  const active = scrub === null ? null : points[scrub] ?? null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const at = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let distance = Infinity;
    for (let index = 0; index < points.length; index += 1) {
      const d = Math.abs(model.x(index) - at);
      if (d < distance) { distance = d; best = index; }
    }
    setScrub(best);
  }

  if (points.length === 0) {
    return (
      <div className="rounded-card border border-outline-variant/70 bg-surface-container-lowest p-5">
        <p className="text-[14px] font-semibold">Nothing confirmed for this period yet.</p>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          Payments and expenses you record appear here as a chart.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-card border border-outline-variant/70 bg-surface-container-lowest p-3 ${reduce ? '' : 'bank-fade'}`}>
      {/* Scrub card: the numbers for the period under the finger. */}
      <div className="mb-1 flex min-h-[34px] items-center justify-between px-1">
        <span className="text-[13px] font-semibold text-on-surface-variant">
          {active ? active.label : 'Scrub the chart for a period'}
        </span>
        {active && (
          <span className="flex items-center gap-3 text-[12.5px] font-semibold tabular-nums">
            <span style={{ color: '#2f6b3f' }}>in {money(active.collectedCents)}</span>
            <span style={{ color: '#a3341f' }}>out {money(active.spentCents)}</span>
            <span className="text-on-background">kept {signed(active.keptCents)}</span>
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Money in and out over ${points.length} periods`}
        className="w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setScrub(null)}
      >
        {/* y-axis top label */}
        <text x={0} y={PAD_TOP - 8} fontSize="9" fill="#8a8070">{money(model.top)}</text>

        <path d={model.area(model.spent)} fill="#c8412e" fillOpacity="0.22" />
        <path d={model.ridge(model.spent)} fill="none" stroke="#b03a29" strokeWidth="1.6" strokeDasharray="4 3" />
        <path d={model.area(model.collected)} fill="#6f9a78" fillOpacity="0.34" />
        <path d={model.ridge(model.collected)} fill="none" stroke="#2f6b3f" strokeWidth="2.2" strokeLinejoin="round" />

        {/* Kept diamonds: filled gold when kept, hollow when spent more. */}
        {points.map((point, index) => {
          const cx = model.x(index);
          const cy = model.y(Math.abs(point.keptCents));
          return point.keptCents < 0 ? (
            <rect key={`k-${point.key}`} x={cx - 3} y={cy - 3} width="6" height="6" fill="none" stroke="#d4af37" strokeWidth="1.4" transform={`rotate(45 ${cx} ${cy})`} />
          ) : (
            <rect key={`k-${point.key}`} x={cx - 3} y={cy - 3} width="6" height="6" fill="#d4af37" transform={`rotate(45 ${cx} ${cy})`} />
          );
        })}

        {/* Peak labels, shifted right when they would meet the y-axis. */}
        {points.length > 1 && (
          <>
            <text x={peakLabelX(model.x(model.maxCollected), 20, Y_AXIS)} y={model.y(model.collected[model.maxCollected]) - 6}
              fontSize="9.5" fontWeight="700" textAnchor="middle" fill="#2f6b3f">{money(points[model.maxCollected].collectedCents)}</text>
            <text x={peakLabelX(model.x(model.maxSpent), 20, Y_AXIS)} y={model.y(model.spent[model.maxSpent]) + 12}
              fontSize="9.5" fontWeight="700" textAnchor="middle" fill="#b03a29">{money(points[model.maxSpent].spentCents)}</text>
          </>
        )}

        {/* Axis labels: first, middle and last only, so they never collide. */}
        {[0, Math.floor((points.length - 1) / 2), points.length - 1]
          .filter((index, at, all) => all.indexOf(index) === at)
          .map((index) => (
            <text key={`x-${points[index].key}`} x={model.x(index)} y={H - 6} fontSize="9" fill="#8a8070"
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>
              {points[index].label}
            </text>
          ))}

        {/* Scrub line + dots: circle for in, square for spent. */}
        {scrub !== null && points[scrub] && (
          <g>
            <line x1={model.x(scrub)} y1={PAD_TOP - 6} x2={model.x(scrub)} y2={H - PAD_BOTTOM}
              stroke="#b9ab93" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={model.x(scrub)} cy={model.y(points[scrub].collectedCents)} r="3.4" fill="#2f6b3f" />
            <rect x={model.x(scrub) - 3} y={model.y(points[scrub].spentCents) - 3} width="6" height="6" fill="#b03a29" />
          </g>
        )}
      </svg>

      {overspent && (
        <p className="mt-1 px-1 text-[12.5px] font-semibold" style={{ color: '#a3341f' }}>
          Spent more than brought in in at least one period.
        </p>
      )}

      {unaccounted > 0 && (
        <div className="mt-2 flex items-center gap-2 rounded-[14px] bg-surface-container-low px-3 py-2">
          <p className="min-w-0 flex-1 text-[12.5px] text-on-surface-variant">
            {unaccounted} bank {unaccounted === 1 ? 'item' : 'items'} aren’t included. They join once you review them.
          </p>
          <button
            type="button"
            onClick={onReview}
            className="h-9 shrink-0 rounded-full border-[1.5px] border-outline-variant px-3 text-[12.5px] font-semibold"
          >
            Review
          </button>
        </div>
      )}
    </div>
  );
}

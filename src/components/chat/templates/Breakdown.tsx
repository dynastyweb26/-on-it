'use client';
// chart.breakdown — design/ai-templates/Breakdown.dc.html. Horizontal bars, never
// a pie. Ranking, the top six, Other last and the whole-number shares are
// src/lib/templates/breakdown.ts; this card draws what it is given. Amounts and
// the total arrive finished and unsigned; the card prefixes the sign from `tone`.
import { Eyebrow, MONO, Sym, TryAgain, tap } from './shared';
import type { BreakdownProps } from '@/lib/templates/props';
import type { BreakdownCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

const LINE = '1px solid var(--tpl-line)';
const MONT = 'var(--font-montserrat), Montserrat, sans-serif';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

export default function Breakdown({
  state = 'filled', tone = 'out', eyebrow, total, rows, onRowTap,
}: BreakdownProps & BreakdownCallbacks) {
  const isIn = tone === 'in';
  const sign = isIn ? '+' : '−';
  const color = isIn ? 'var(--tpl-green)' : 'var(--tpl-red)';
  const bar = isIn ? 'var(--tpl-chart-in)' : 'var(--tpl-bar-out)';
  const shown = [...rows.filter((r) => !r.other).slice(0, 6), ...rows.filter((r) => r.other)];
  return (
    <div
      data-template="chart.breakdown"
      data-state={state}
      style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, overflow: 'hidden', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      <div style={{ padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {state === 'filled' && (
          <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 24, lineHeight: 1.15, letterSpacing: '-.01em', color, ...ELLIPSIS }}>{sign + total + (isIn ? ' in.' : ' out.')}</div>
        )}
        {state === 'loading' && <div style={{ height: 22, width: '50%', borderRadius: 6, background: 'var(--tpl-skel)', marginTop: 4 }} />}
      </div>

      {state === 'loading' &&
        [1, 2, 3].map((k) => (
          <div key={k} style={{ padding: '14px 16px', borderTop: LINE, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ height: 12, width: '40%', borderRadius: 6, background: 'var(--tpl-skel)' }} />
              <div style={{ height: 12, width: '22%', borderRadius: 6, background: 'var(--tpl-skel)' }} />
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--tpl-skel-light)' }} />
          </div>
        ))}

      {state === 'empty' && (
        <div style={{ padding: '0 16px 16px', fontSize: 15, lineHeight: 1.45, color: 'var(--tpl-muted-2)' }}>Nothing to break down yet for this period.</div>
      )}

      {state === 'error' && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Sym name="error" size={20} color="var(--tpl-red)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Couldn&apos;t load categories.</div>
              <div style={{ fontSize: 13, color: 'var(--tpl-muted)' }}>Check your connection and try again.</div>
            </div>
          </div>
          <TryAgain />
        </div>
      )}

      {state === 'filled' &&
        shown.map((r, i) => {
          const t = tap(() => onRowTap?.(r, i));
          return (
            <div
              key={i}
              {...t}
              className={`${t.className} tpl-press`}
              style={{ padding: '12px 10px 12px 16px', borderTop: LINE, display: 'flex', alignItems: 'center', gap: 8, minHeight: 60, boxSizing: 'border-box' }}
            >
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, ...ELLIPSIS }}>{r.name}</div>
                  <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', color }}>{sign + r.amount}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--tpl-skel)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, width: Math.max(r.share, 1.5) + '%', background: r.other ? 'var(--tpl-bar-other)' : bar }} />
                  </div>
                  <div style={{ width: 34, textAlign: 'right', fontFamily: MONO, fontSize: 12, color: 'var(--tpl-muted-2)' }}>{r.share + '%'}</div>
                </div>
              </div>
              <Sym name="chevron_right" size={20} color="var(--tpl-chevron)" style={{ flex: 'none' }} />
            </div>
          );
        })}
    </div>
  );
}

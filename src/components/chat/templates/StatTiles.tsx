'use client';
// stat.tiles — design/ai-templates/StatTiles.dc.html. Values arrive as finished
// strings (sign included); the only logic is the layout rule in the file's script.
import { Eyebrow, Sym, TONE, TryAgain } from './shared';
import type { StatTilesProps } from '@/lib/templates/props';
import './templates.css';

const ICON = { up: 'arrow_upward', down: 'arrow_downward', flat: 'remove' } as const;
const LINE = '1px solid var(--tpl-line)';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const MONT = 'var(--font-montserrat), Montserrat, sans-serif';

export default function StatTiles({ state = 'filled', eyebrow, title, tiles }: StatTilesProps) {
  const src = tiles.slice(0, 3);
  const n = src.length;
  const compact = n === 3 && src.every((t) => t.value.length <= 7);
  const cols = n === 1 ? 'minmax(0,1fr)' : n === 3 && compact ? 'repeat(3,minmax(0,1fr))' : 'repeat(2,minmax(0,1fr))';
  return (
    <div
      data-template="stat.tiles"
      data-state={state}
      style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, overflow: 'hidden', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      <div style={{ padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {title && <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 20, lineHeight: 1.2, letterSpacing: '-.01em' }}>{title}</div>}
      </div>

      {state === 'loading' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 1, background: 'var(--tpl-line)', borderTop: LINE }}>
          {[1, 2, 3].map((k) => (
            <div key={k} style={{ background: 'var(--tpl-card)', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ height: 10, width: '60%', borderRadius: 5, background: 'var(--tpl-skel-light)' }} />
              <div style={{ height: 18, width: '80%', borderRadius: 6, background: 'var(--tpl-skel)' }} />
              <div style={{ height: 9, width: '45%', borderRadius: 5, background: 'var(--tpl-skel-light)' }} />
            </div>
          ))}
        </div>
      )}

      {state === 'empty' && (
        <div style={{ padding: '14px 16px 16px', borderTop: LINE, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No money in or out yet.</div>
          <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--tpl-muted)' }}>Record a payment or snap a receipt and it will show here.</div>
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '14px 16px 16px', borderTop: LINE, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Sym name="error" size={20} color="var(--tpl-red)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Couldn&apos;t load these numbers.</div>
              <div style={{ fontSize: 13, color: 'var(--tpl-muted)' }}>Check your connection and try again.</div>
            </div>
          </div>
          <TryAgain />
        </div>
      )}

      {state === 'filled' && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 1, background: 'var(--tpl-line)', borderTop: LINE }}>
          {src.map((t, i) => {
            const wide = n === 3 && !compact && i === 0;
            const size = n === 1 || wide ? '30px' : n === 2 ? '24px' : '20px';
            return (
              <div key={i} style={{ background: 'var(--tpl-card)', padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, gridColumn: wide ? 'span 2' : 'auto' }}>
                <div style={{ fontSize: 13, color: 'var(--tpl-muted-2)', ...ELLIPSIS }}>{t.label}</div>
                <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: size, lineHeight: 1.15, letterSpacing: '-.01em', whiteSpace: 'nowrap', color: TONE[t.tone] }}>{t.value}</div>
                <div style={{ fontSize: 12, color: 'var(--tpl-eyebrow)', ...ELLIPSIS }}>{t.period}</div>
                {t.change && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 500, color: 'var(--tpl-muted-2)', marginTop: 2, minWidth: 0 }}>
                    <Sym name={ICON[t.change.dir]} size={15} style={{ flex: 'none' }} />
                    <span style={ELLIPSIS}>{t.change.text}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

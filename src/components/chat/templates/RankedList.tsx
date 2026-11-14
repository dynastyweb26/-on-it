'use client';
// list.ranked — design/ai-templates/RankedList.dc.html. Every value is the
// file's. Money arrives finished; nothing here formats or adds it.
import { Eyebrow, Sym, TONE, TryAgain, tap } from './shared';
import type { RankedListProps } from '@/lib/templates/props';
import type { RankedListCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

const CHIP = {
  late: ['var(--tpl-red-soft)', 'var(--tpl-red)', 'schedule'],
  paid: ['var(--tpl-paid-soft)', 'var(--tpl-paid)', 'verified'],
  due: ['var(--tpl-skel)', 'var(--tpl-muted-2)', 'event'],
} as const;

const initials = (n: string) => {
  const w = n.trim().split(/\s+/);
  return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)).toUpperCase();
};

const LINE = '1px solid var(--tpl-line)';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const MONT = 'var(--font-montserrat), Montserrat, sans-serif';

export default function RankedList({
  state = 'filled', eyebrow, title, totalCount, rows, total, hideTotal = false, onRowTap, onShowAll, onRetry,
}: RankedListProps & RankedListCallbacks) {
  const heading = state === 'empty' ? 'Nobody owes you.' : title;
  const showTitle = state === 'filled' || state === 'empty';
  return (
    <div
      data-template="list.ranked"
      data-state={state}
      style={{ background: 'var(--tpl-card)', border: '1.5px solid var(--tpl-card-border)', borderRadius: 24, overflow: 'hidden', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      <div style={{ padding: '16px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        {showTitle && (
          <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 20, lineHeight: 1.2, letterSpacing: '-.01em', textWrap: 'pretty' }}>{heading}</div>
        )}
        {state === 'loading' && <div style={{ height: 18, width: '58%', borderRadius: 6, background: 'var(--tpl-skel)', marginTop: 4 }} />}
      </div>

      {state === 'loading' &&
        [1, 2, 3].map((k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: LINE }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--tpl-skel)', flex: 'none' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ height: 12, width: '55%', borderRadius: 6, background: 'var(--tpl-skel)' }} />
              <div style={{ height: 10, width: '35%', borderRadius: 5, background: 'var(--tpl-skel-light)' }} />
            </div>
            <div style={{ height: 14, width: 64, borderRadius: 6, background: 'var(--tpl-skel)' }} />
          </div>
        ))}

      {state === 'empty' && (
        <div style={{ padding: '0 16px 16px', fontSize: 15, lineHeight: 1.45, color: 'var(--tpl-muted-2)', textWrap: 'pretty' }}>
          Every invoice is paid up. New ones show here once they are sent.
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Sym name="error" size={20} color="var(--tpl-red)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>Couldn&apos;t load this list.</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--tpl-muted)' }}>Nothing changed. Check your connection and try again.</div>
            </div>
          </div>
          <TryAgain onClick={onRetry} />
        </div>
      )}

      {state === 'filled' && (
        <>
          {rows.slice(0, 5).map((r, i) => {
            const c = r.chip ? CHIP[r.chip.tone] : null;
            const t = tap(() => onRowTap?.(r, i));
            return (
              <div
                key={i}
                {...t}
                className={`${t.className} tpl-press`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px 12px 16px', borderTop: LINE, minHeight: 64, boxSizing: 'border-box' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--tpl-gold-soft)', color: 'var(--tpl-avatar-ink)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{initials(r.name)}</div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, ...ELLIPSIS }}>{r.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--tpl-muted)', ...ELLIPSIS }}>{r.secondary}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
                  <div style={{ fontFamily: MONT, fontWeight: 700, fontSize: 15, color: TONE[r.tone ?? 'neutral'], whiteSpace: 'nowrap' }}>{r.amount}</div>
                  {c && r.chip && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 20, padding: '0 7px', borderRadius: 999, background: c[0], color: c[1], fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <Sym name={c[2]} size={13} />
                      <span>{r.chip.label}</span>
                    </div>
                  )}
                </div>
                <Sym name="chevron_right" size={20} color="var(--tpl-chevron)" style={{ flex: 'none' }} />
              </div>
            );
          })}
          {!hideTotal && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 16px', borderTop: LINE, background: 'var(--tpl-total-bg)' }}>
              <div style={{ fontSize: 13, color: 'var(--tpl-muted-2)', minWidth: 0, ...ELLIPSIS }}>{total.label}</div>
              <div style={{ fontFamily: MONT, fontWeight: 800, fontSize: 17, whiteSpace: 'nowrap', color: TONE[total.tone ?? 'neutral'] }}>{total.amount}</div>
            </div>
          )}
          {totalCount > 5 && (
            <div
              {...tap(onShowAll)}
              className="tpl-tap tpl-hover"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 16px', height: 52, borderTop: LINE, color: 'var(--tpl-gold-ink)', fontSize: 15, fontWeight: 600 }}
            >
              <span>{`Show all ${totalCount}`}</span>
              <Sym name="chevron_right" size={20} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

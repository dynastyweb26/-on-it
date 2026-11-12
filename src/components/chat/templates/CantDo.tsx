'use client';
// cant.do — design/ai-templates/CantDo.dc.html. The assistant's "I can't do that
// yet" bubble, a Request button that turns into "Requested", and up to two
// things it can do instead.
import { useEffect, useRef, useState } from 'react';
import { MONO, Sym, tap } from './shared';
import type { CantDoProps } from '@/lib/templates/props';
import type { CantDoCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

const BUBBLE = { background: 'var(--tpl-bubble)', border: '1px solid var(--tpl-bubble-border)', borderRadius: 20 } as const;

export default function CantDo({
  state = 'filled', line, noAlts = false, alternatives = [], onAlt, onRequest,
}: CantDoProps & CantDoCallbacks) {
  // The design keeps its state locally so the Request tap can flip it.
  const [st, setSt] = useState<string>(state);
  useEffect(() => setSt(state), [state]);
  const sent = useRef(false); // synchronous guard: a second tap never re-requests
  useEffect(() => {
    sent.current = state === 'requested';
  }, [state]);

  const request = () => {
    if (sent.current) return;
    sent.current = true;
    setSt('requested');
    onRequest?.();
  };

  const alts = alternatives.slice(0, 2);
  const t = tap(request);
  return (
    <div
      data-template="cant.do"
      data-state={st}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      {st === 'loading' && (
        <div style={{ ...BUBBLE, padding: '16px 18px', display: 'flex', gap: 6 }}>
          {[0, 1, 2].map((k) => (
            <div key={k} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--tpl-dots)' }} />
          ))}
        </div>
      )}

      {st !== 'loading' && (
        <>
          <div style={{ ...BUBBLE, maxWidth: '100%', boxSizing: 'border-box', padding: '11px 15px', fontSize: 16, lineHeight: 1.4, textWrap: 'pretty' }}>{line}</div>

          {st !== 'requested' && (
            <div
              {...t}
              className="tpl-tap tpl-hover"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 16px', borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-white)', fontSize: 15, fontWeight: 600 }}
            >
              <Sym name="lightbulb" size={18} />
              Request this feature
            </div>
          )}

          {st === 'requested' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 16px 0 6px', borderRadius: 999, background: 'var(--tpl-gold-soft)', fontSize: 15, fontWeight: 600, color: 'var(--tpl-ink)' }}>
              <span
                aria-hidden
                className="material-symbols-outlined"
                style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--tpl-gold)', fontSize: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: 'onitPop 420ms cubic-bezier(.2,.9,.3,1.25) both' }}
              >
                check
              </span>
              Requested. We read every one.
            </div>
          )}

          {st === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--tpl-red)' }}>
              <Sym name="error" size={16} />
              Couldn&apos;t send the request. Tap to try again.
            </div>
          )}

          {alts.length > 0 && !noAlts && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--tpl-eyebrow)', marginTop: 4 }}>I can do this instead</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: '100%' }}>
                {alts.map((label) => (
                  <div
                    key={label}
                    {...tap(() => onAlt?.(label))}
                    className="tpl-tap tpl-hover"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, maxWidth: '100%', boxSizing: 'border-box', padding: '0 14px', borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-card)', fontSize: 15, fontWeight: 500 }}
                  >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                    <Sym name="south_west" size={18} color="var(--tpl-icon-muted)" style={{ flex: 'none' }} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

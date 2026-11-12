'use client';
// nav.link — design/ai-templates/NavLink.dc.html. One to three rows that open a record.
import { Sym, tap } from './shared';
import type { NavLinkProps } from '@/lib/templates/props';
import type { NavLinkCallbacks } from '@/lib/templates/callbacks';
import './templates.css';

const LINE = '1px solid var(--tpl-line)';
const ELLIPSIS = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
const TILE = { width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } as const;

export default function NavLink({
  state = 'filled', items, emptyTitle, onOpen,
}: NavLinkProps & NavLinkCallbacks) {
  return (
    <div
      data-template="nav.link"
      data-state={state}
      style={{ background: 'var(--tpl-nav-card)', border: '1.5px solid var(--tpl-nav-border)', borderRadius: 22, overflow: 'hidden', fontFamily: 'var(--font-inter), Inter, sans-serif', lineHeight: 'normal', color: 'var(--tpl-ink)' }}
    >
      {state === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--tpl-skel)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ height: 12, width: '55%', borderRadius: 6, background: 'var(--tpl-skel)' }} />
            <div style={{ height: 10, width: '35%', borderRadius: 5, background: 'var(--tpl-skel-light)' }} />
          </div>
        </div>
      )}

      {state === 'empty' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14 }}>
          <div style={{ ...TILE, background: 'var(--tpl-skel)' }}>
            <Sym name="link_off" size={20} color="var(--tpl-icon-muted)" />
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {emptyTitle && <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tpl-muted-2)' }}>{emptyTitle}</div>}
            <div style={{ fontSize: 13, color: 'var(--tpl-muted)' }}>It was deleted or merged.</div>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 10px 10px 14px' }}>
          <div style={{ ...TILE, background: 'var(--tpl-red-soft)' }}>
            <Sym name="error" size={20} color="var(--tpl-red)" />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 16, fontWeight: 600, ...ELLIPSIS }}>{`Couldn't open ${items[0]?.title ?? ''}`}</div>
            <div style={{ fontSize: 13, color: 'var(--tpl-muted)' }}>Check your connection.</div>
          </div>
          <div {...tap()} style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 15, fontWeight: 600, color: 'var(--tpl-gold-ink)', cursor: 'pointer', flex: 'none' }}>Retry</div>
        </div>
      )}

      {state === 'filled' &&
        items.map((it, i) => {
          const t = tap(() => onOpen?.(it, i));
          return (
            <div
              key={i}
              {...t}
              className={`${t.className} tpl-press`}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 10px 12px 14px', minHeight: 64, boxSizing: 'border-box', borderTop: i ? LINE : 'none' }}
            >
              <div style={{ ...TILE, background: 'var(--tpl-skel)' }}>
                <Sym name={it.icon} size={20} color="var(--tpl-ink)" />
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 16, fontWeight: 600, ...ELLIPSIS }}>{it.title}</div>
                <div style={{ fontSize: 13, color: 'var(--tpl-muted)', ...ELLIPSIS }}>{it.line}</div>
              </div>
              <Sym name="chevron_right" size={20} color="var(--tpl-muted-2)" style={{ flex: 'none' }} />
            </div>
          );
        })}
    </div>
  );
}

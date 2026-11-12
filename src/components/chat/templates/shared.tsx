'use client';
// Bits every template card shares. Values are the design files' own.
import type { CSSProperties, KeyboardEvent } from 'react';

export const MONO = "ui-monospace,'SF Mono',Menlo,monospace";
export const TONE = { in: 'var(--tpl-green)', out: 'var(--tpl-red)', neutral: 'var(--tpl-ink)' } as const;

/** Material Symbols Outlined through the app's subset font; the name is the design's. */
export function Sym({ name, size, color, style }: { name: string; size: number; color?: string; style?: CSSProperties }) {
  return (
    <span aria-hidden className="material-symbols-outlined" style={{ fontSize: size, color, ...style }}>
      {name}
    </span>
  );
}

/** The design's `role="button"` div: focusable, Enter and Space tap. */
export function tap(fn?: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    className: 'tpl-tap',
    onClick: fn,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn?.();
      }
    },
  };
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--tpl-eyebrow)' }}>
      {children}
    </div>
  );
}

/** "Try again" pill, shared by list.ranked and stat.tiles error states. */
export function TryAgain({ onClick }: { onClick?: () => void }) {
  const t = tap(onClick);
  return (
    <div style={{ display: 'flex' }}>
      <div
        {...t}
        className={t.className}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 18px', borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-white)', fontSize: 15, fontWeight: 600 }}
      >
        <Sym name="refresh" size={18} />
        Try again
      </div>
    </div>
  );
}

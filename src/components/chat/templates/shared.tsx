'use client';
// Bits every template card shares. Values are the design files' own.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { guardedTap } from './pending-tap';

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

/**
 * A tap that cannot finish instantly: pending shows on the first render after the tap
 * (well inside 100ms), and a repeat tap while it runs is ignored by a synchronous ref.
 * Pending clears on every exit, success or failure.
 */
export function usePendingTap(fn?: () => unknown) {
  const [pending, setPending] = useState(false);
  const alive = useRef(true);
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => () => { alive.current = false; }, []);
  const run = useRef<(() => void) | null>(null);
  if (!run.current) run.current = guardedTap(() => latest.current?.(), (p) => { if (alive.current) setPending(p); });
  return { pending, run: fn ? run.current : undefined };
}

/** "Try again" pill, shared by the error states. While the retry runs the icon spins (onitSpin). */
export function TryAgain({ onClick }: { onClick?: () => unknown }) {
  const { pending, run } = usePendingTap(onClick);
  const t = tap(run);
  return (
    <div style={{ display: 'flex' }}>
      <div
        {...t}
        className={t.className}
        aria-busy={pending}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 18px', borderRadius: 999, border: '1.5px solid var(--tpl-btn-border)', background: 'var(--tpl-white)', fontSize: 15, fontWeight: 600 }}
      >
        <Sym name={pending ? 'progress_activity' : 'refresh'} size={18} style={pending ? { animation: 'onitSpin .9s linear infinite' } : undefined} />
        Try again
      </div>
    </div>
  );
}

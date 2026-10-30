'use client';
// The bank bottom sheet (digest time, disconnect confirm, row detail, the
// placeholder provider sheet). Same pattern as the app's other sheets: a
// portal, role="dialog" aria-modal, scrim + Escape to close, focus moved to the
// first control and returned to the trigger, Tab trapped inside.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function BankSheet({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('button:not([disabled]), [role="radio"]');
    first?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [role="radio"]') ?? [])
      .filter((el) => el.getClientRects().length > 0);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  }

  return createPortal(
    <div data-bank-motion className="fixed inset-0 z-[88] flex items-end justify-center md:items-center">
      <div aria-hidden onClick={onClose} className="absolute inset-0" style={{ background: 'var(--oi-scrim)' }} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="bank-sheet-up relative w-full max-w-[440px] rounded-t-[var(--oi-radius-sheet)] bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-card-raised md:rounded-[var(--oi-radius-sheet)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

'use client';
// The long-press behind ListRow (Clients, Products, Recurring) and the
// Expenses rows: hold LONG_PRESS_MS to fire, a drag past MOVE_CANCEL_PX cancels
// (so scrolling never fires it), a haptic tick on fire, the context menu is
// blocked, and the click that follows a hold is swallowed via consumeClick().
import { useEffect, useRef } from 'react';

export const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 8;

export function useLongPress(onLongPress: (el: HTMLElement) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancel = () => { clearTimeout(timer.current); start.current = null; };
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        const el = e.currentTarget;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          fired.current = true;
          try { navigator.vibrate?.(10); } catch { /* unsupported */ }
          onLongPress(el);
        }, LONG_PRESS_MS);
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_CANCEL_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent<HTMLElement>) => e.preventDefault(),
    },
    /** True (once) when the click that just arrived is the release of a hold. */
    consumeClick: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
  };
}

'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { AXIS_SLOP_PX, classifyAxis, isFlick, type GestureAxis } from '@/lib/swipe';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  /** Adds an Edit action left of Delete (saved clients / products, frames 3a). */
  onEdit?: () => void;
  className?: string;
  /** Square corners, for rows inside a grouped card (Expenses). */
  flat?: boolean;
}

const OPEN_PX = 70; // px of travel before the row stays open
const MAX_SWIPE = 90; // max px distance
const MAX_SWIPE_EDIT = 148; // Edit + Delete
const FLICK_MIN_DX = 56;
const FLICK_MIN_PX_PER_MS = 1;
const FLICK_SAMPLE_MS = 100;

type RowGesture = {
  x: number;
  y: number;
  /** The row's resting offset when the finger went down. */
  base: number;
  axis: GestureAxis;
  /** False until the row itself moves (a right drag on a closed row is inert). */
  active: boolean;
  samples: { x: number; t: number }[];
};

export default function SwipeableRow({ children, onDelete, onEdit, className = '', flat = false }: SwipeableRowProps) {
  const maxSwipe = onEdit ? MAX_SWIPE_EDIT : MAX_SWIPE;
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const gesture = useRef<RowGesture | null>(null);
  // The rendered transform's source of truth, so touchend never decides on a
  // possibly stale state value.
  const translateRef = useRef(0);

  function moveTo(next: number) {
    translateRef.current = next;
    setTranslateX(next);
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    gesture.current = {
      x: t.clientX,
      y: t.clientY,
      base: translateRef.current,
      axis: 'pending',
      active: false,
      samples: [{ x: t.clientX, t: performance.now() }],
    };
  }

  function handleTouchMove(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;

    // Decide once: a mostly-vertical drag stays a scroll for the whole
    // gesture, so the row can never start sliding mid-scroll.
    if (g.axis === 'pending') g.axis = classifyAxis(dx, dy);
    if (g.axis !== 'horizontal') return;

    const now = performance.now();
    g.samples.push({ x: t.clientX, t: now });
    if (g.samples.length > 12) g.samples.shift();

    // Subtract the activation slop so crossing the 12px line doesn't jump the
    // row. The direction decides whether the finger is opening or closing.
    const direction = dx < 0 ? -1 : 1;
    let next = g.base + dx - direction * AXIS_SLOP_PX;
    if (next > 0) next = 0;
    // Past the actions the row resists (rubber band, 2·14) and settles back.
    if (next < -maxSwipe) {
      next = -maxSwipe - Math.min((-next - maxSwipe) * 0.3, maxSwipe * 0.4);
    }
    if (!g.active && (next < 0 || g.base < 0)) {
      g.active = true;
      setIsSwiping(true);
    }
    moveTo(next);
  }

  function settle(open: boolean) {
    moveTo(open ? -maxSwipe : 0);
    setIsSwiping(false);
    gesture.current = null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const g = gesture.current;
    if (!g) return;
    if (g.axis !== 'horizontal') {
      // A tap or a scroll leaves the row exactly where it was.
      setIsSwiping(false);
      gesture.current = null;
      return;
    }
    const t = e.changedTouches[0];
    const now = performance.now();
    // Recent speed only: resting before lifting is not a flick, however far
    // the row travelled.
    const from = g.samples.find((p) => now - p.t <= FLICK_SAMPLE_MS) ?? g.samples[g.samples.length - 1];
    const dt = from ? Math.max(1, now - from.t) : 1;
    const dx = t ? t.clientX - g.x : 0;
    const recentDx = t && from ? t.clientX - from.x : 0;
    const flickOpen = dx < 0 && isFlick(recentDx, dt, {
      minDistance: FLICK_MIN_DX,
      minVelocity: FLICK_MIN_PX_PER_MS,
      distance: Math.abs(dx),
    });
    settle(translateRef.current < -OPEN_PX || flickOpen);
  }

  function handleTouchCancel() {
    if (!gesture.current) return;
    settle(translateRef.current < -OPEN_PX);
  }

  function resetSwipe() {
    moveTo(0);
  }

  return (
    <div
      data-no-tab-swipe="true"
      className={`relative overflow-hidden ${flat ? '' : 'rounded-card'} ${className}`}
    >
      {/* Revealed Delete Action Background — only painted while the row is
          moved, so its edge never shows past an at-rest row's corners. */}
      {onEdit ? (
        <div className={`absolute inset-y-0 right-0 flex ${flat ? '' : 'rounded-card overflow-hidden'}`}
          style={{ visibility: translateX < 0 || isSwiping ? 'visible' : 'hidden' }}>
          <button type="button" aria-label="Edit"
            onClick={() => { resetSwipe(); onEdit(); }}
            className="flex w-[74px] flex-col items-center justify-center gap-0.5 bg-surface-container-high text-[13px] font-semibold text-on-background transition active:scale-95">
            <Icon name="edit" size={20} />
            Edit
          </button>
          <button type="button" aria-label="Delete"
            onClick={() => { resetSwipe(); onDelete(); }}
            className="flex w-[74px] flex-col items-center justify-center gap-0.5 bg-error text-[13px] font-bold text-white transition active:scale-95">
            <Icon name="delete" size={20} />
            Delete
          </button>
        </div>
      ) : (
        <div className={`absolute inset-y-0 right-0 flex items-center justify-end bg-error px-4 ${flat ? '' : 'rounded-card'}`}
          style={{ visibility: translateX < 0 || isSwiping ? 'visible' : 'hidden' }}>
          <button
            type="button"
            aria-label="Delete item"
            onClick={() => {
              resetSwipe();
              onDelete();
            }}
            className="flex h-full items-center justify-center gap-1 px-2 text-label-lg font-bold text-white transition active:scale-95"
          >
            <Icon name="delete" size={24} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Swipeable Foreground Row */}
      <div
        className="relative bg-background transition-transform"
        style={{
          transform: `translateX(${translateX}px)`,
          transitionDuration: isSwiping ? '0ms' : 'var(--motion-base)',
          transitionTimingFunction: 'var(--ease-emphasized)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {children}
      </div>
    </div>
  );
}

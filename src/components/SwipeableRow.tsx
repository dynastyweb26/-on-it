'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/Icon';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  /** Adds an Edit action left of Delete (saved clients / products, frames 3a). */
  onEdit?: () => void;
  className?: string;
  /** Square corners, for rows inside a grouped card (Expenses). */
  flat?: boolean;
}

const SWIPE_THRESHOLD = 70; // px to reveal delete button
const MAX_SWIPE = 90; // max px distance
const MAX_SWIPE_EDIT = 148; // Edit + Delete

export default function SwipeableRow({ children, onDelete, onEdit, className = '', flat = false }: SwipeableRowProps) {
  const maxSwipe = onEdit ? MAX_SWIPE_EDIT : MAX_SWIPE;
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    setIsSwiping(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;

    // Directional intent guard: if vertical displacement > horizontal, treat as scroll
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      return;
    }

    // Only allow swiping left (negative dx)
    if (dx < 0) {
      e.stopPropagation(); // Stop tab-swipe from hijacking
      // Past the actions the row resists (rubber band, 2·14) and settles back.
      const offset = dx >= -maxSwipe ? dx : -maxSwipe - Math.min((-dx - maxSwipe) * 0.3, maxSwipe * 0.4);
      setTranslateX(offset);
    } else if (translateX < 0) {
      // Swiping back right
      const offset = Math.min(0, translateX + dx);
      setTranslateX(offset);
    }
  }

  function handleTouchEnd() {
    setIsSwiping(false);
    touchStart.current = null;

    if (translateX < -SWIPE_THRESHOLD / 2) {
      setTranslateX(-maxSwipe);
    } else {
      setTranslateX(0);
    }
  }

  function resetSwipe() {
    setTranslateX(0);
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
      >
        {children}
      </div>
    </div>
  );
}

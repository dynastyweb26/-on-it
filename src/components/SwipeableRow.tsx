'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/Icon';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  className?: string;
}

const SWIPE_THRESHOLD = 70; // px to reveal delete button
const MAX_SWIPE = 90; // max px distance

export default function SwipeableRow({ children, onDelete, className = '' }: SwipeableRowProps) {
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
      const offset = Math.max(dx, -MAX_SWIPE);
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
      setTranslateX(-MAX_SWIPE);
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
      className={`relative overflow-hidden rounded-card ${className}`}
    >
      {/* Revealed Delete Action Background */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end bg-error px-4 rounded-card">
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

      {/* Swipeable Foreground Row */}
      <div
        className="relative bg-background transition-transform"
        style={{
          transform: `translateX(${translateX}px)`,
          transitionDuration: isSwiping ? '0ms' : '200ms',
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

'use client';

// Full-screen photo viewer (design spec §2.5): dark stage, counter, chevrons
// hidden at the ends, 40px swipe, caption below. Page scroll and the sticky bar
// are disabled while it is open.
import { useEffect, useRef } from 'react';
import type { PublicAttachment } from '@/lib/estimates/types';
import EstIcon from './EstIcon';
import s from './estimate.module.css';

export default function PhotoViewer({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: PublicAttachment[];
  index: number;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const touchX = useRef<number | null>(null);
  const photo = photos[index];

  // Lock the page behind the viewer without losing its scroll position.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;

  return (
    <div className={s.viewer} role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className={s.viewerBar}>
        <button type="button" className={s.iconButton} style={{ color: '#FDF8F0' }} onClick={onClose} aria-label="Close photo">
          <EstIcon name="close" size={26} />
        </button>
        <span className={s.viewerCount}>
          {index + 1} of {photos.length}
        </span>
        <span style={{ width: 44 }} aria-hidden />
      </div>

      <div
        className={s.viewerStage}
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          const start = touchX.current;
          touchX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start == null || end == null) return;
          const dx = end - start;
          if (dx <= -40 && index < photos.length - 1) onIndex(index + 1);
          if (dx >= 40 && index > 0) onIndex(index - 1);
        }}
      >
        {index > 0 && (
          <button
            type="button"
            className={`${s.viewerNav} ${s.viewerPrev}`}
            onClick={() => onIndex(index - 1)}
            aria-label="Previous photo"
          >
            <EstIcon name="chevron_left" size={26} />
          </button>
        )}
        {/* A photo whose signed URL could not be minted is skipped: the stage
            only ever shows an image it can load. */}
        {photo?.url && (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, unknown dimensions
          <img className={s.viewerImage} src={photo.url} alt={photo.caption ?? ''} />
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            className={`${s.viewerNav} ${s.viewerNext}`}
            onClick={() => onIndex(index + 1)}
            aria-label="Next photo"
          >
            <EstIcon name="chevron_right" size={26} />
          </button>
        )}
      </div>

      {photo.caption && <p className={s.viewerCaption}>{photo.caption}</p>}
    </div>
  );
}

'use client';

// Full-screen photo viewer (design spec §2.5): dark stage, counter, chevrons
// hidden at the ends, 40px swipe, caption below. Page scroll and the sticky bar
// are disabled while it is open.
//
// One way out on screen: the back arrow at the top-left (ViewerBackButton). The
// thumb-reach close X that used to sit in the bar is gone with it — two exit
// controls beside each other only made the bar read as two different actions.
//
// A second, invisible way out: at the first photo a rightward drag dismisses the
// viewer. It follows the finger, slides the viewer away on a release that
// commits (past 15% of the width or a flick; with a single photo any rightward
// travel), springs back on an early release, and is held off-screen until
// onClose unmounts it so the photo never flashes back. Leftward drags and the
// 40px rule between photos are unchanged. Which gesture a touch becomes is
// decided at the axis lock (lib/photo-dismiss.ts), never at touchstart, so a tap
// on a chevron or on the image still clicks.
//
// The listeners are native and the move one is non-passive: React's touch
// handlers are passive, so preventDefault at the horizontal lock — the only
// thing that stops the page sliding sideways under the drag — cannot be called
// there. The transform is written to the element every frame, never through
// React state.
import { useEffect, useRef } from 'react';
import EstIcon from './EstIcon';
import ViewerBackButton from './ViewerBackButton';
import s from './estimate.module.css';
import {
  photoDismissAxis,
  photoDismissCommits,
  photoDismissOutMs,
  photoDismissSpringMs,
  photoDismissStarts,
} from '@/lib/photo-dismiss';
import { COMMIT_EASE, SPRING_EASE } from '@/components/tabs/tab-motion';
import { dragFromLock, type GestureAxis } from '@/lib/swipe';
import { suppressNextClick } from '@/lib/swipe-dom';
import { reducedMotion } from '@/lib/list-motion';

/** What the viewer needs from a photo. Structural on purpose: the public page
 *  passes `PublicAttachment[]` and the owner's estimate card passes its own
 *  signed-URL items, so both share this one viewer instead of growing a second. */
export type ViewerPhoto = {
  id: string;
  /** Signed URL; null when the object could not be signed (never staged). */
  url: string | null;
  caption?: string | null;
};

type Gesture = {
  id: number;
  x: number;
  y: number;
  axis: GestureAxis;
  /** Where the axis was decided: the drag starts from there, not from x. */
  lockDx: number;
  /** True once the touch is the dismissal rather than photo navigation. */
  dismiss: boolean;
};

export default function PhotoViewer({
  photos,
  index,
  onClose,
  onIndex,
}: {
  photos: ViewerPhoto[];
  index: number;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const samples = useRef<{ x: number; t: number }[]>([]);
  const offset = useRef(0);
  const anim = useRef<Animation | null>(null);
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

  // The dismissal: drag right on the first photo, release to close.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const clear = () => {
      anim.current?.cancel();
      anim.current = null;
      el.style.transform = '';
      el.style.willChange = '';
      offset.current = 0;
    };

    const paint = (o: number) => {
      el.style.transform = o > 0 ? `translate3d(${o}px, 0, 0)` : '';
    };

    // Release speed over the last ~100 ms, so a finger that rests before it
    // lifts is not a flick however far it travelled.
    const release = () => {
      const now = performance.now();
      const list = samples.current;
      const last = list[list.length - 1] ?? { x: 0, t: now };
      const from = list.find((p) => now - p.t <= 100) ?? list[0] ?? last;
      const dt = Math.max(1, now - from.t);
      const recentDx = last.x - from.x;
      return { recentDx, dt, velocity: recentDx / dt };
    };

    const springBack = (velocity: number) => {
      const o = offset.current;
      if (!o || reducedMotion()) { clear(); return; }
      const width = el.clientWidth || window.innerWidth;
      anim.current = el.animate(
        [{ transform: `translate3d(${o}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: photoDismissSpringMs(o, width, velocity), easing: SPRING_EASE, fill: 'both' },
      );
      anim.current.onfinish = clear;
    };

    const close = (velocity: number) => {
      const o = offset.current;
      const width = el.clientWidth || window.innerWidth;
      if (reducedMotion()) {
        clear();
        onClose();
        return;
      }
      anim.current = el.animate(
        [{ transform: `translate3d(${o}px, 0, 0)` }, { transform: `translate3d(${width}px, 0, 0)` }],
        { duration: photoDismissOutMs(o, width, velocity), easing: COMMIT_EASE, fill: 'both' },
      );
      anim.current.onfinish = () => {
        // Held at the width, not reset: onClose unmounts the viewer, and a
        // transform of 0 here would flash the photo back for a frame first.
        anim.current?.cancel();
        anim.current = null;
        el.style.transform = `translate3d(${width}px, 0, 0)`;
        el.style.willChange = 'transform';
        offset.current = 0;
        onClose();
      };
    };

    const onStart = (e: TouchEvent) => {
      gesture.current = null;
      if (anim.current) return;
      const t = e.touches[0];
      if (!t) return;
      // The target is not judged: a tap on the image, a chevron or the back
      // arrow must still click. Only a drag that has gone sideways is ours.
      gesture.current = { id: t.identifier, x: t.clientX, y: t.clientY, axis: 'pending', lockDx: 0, dismiss: false };
      samples.current = [{ x: t.clientX, t: performance.now() }];
    };

    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (e.touches.length !== 1) { gesture.current = null; return; }
      const t = Array.from(e.touches).find((p) => p.identifier === g.id);
      if (!t) return;
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (g.axis === 'pending') {
        const axis = photoDismissAxis(dx, dy);
        if (axis === 'pending') return;
        // Vertical is not ours; horizontal is either the dismissal (first photo,
        // rightward) or the 40px photo navigation, decided on release.
        g.axis = axis;
        if (axis !== 'horizontal') { gesture.current = null; return; }
        g.dismiss = photoDismissStarts(index, dx, axis);
        if (!g.dismiss) return;
        g.lockDx = dx;
        el.style.willChange = 'transform';
      }
      if (!g.dismiss) return;
      // Ours from the lock on, so the page must not slide under the drag.
      if (e.cancelable) e.preventDefault();
      offset.current = Math.max(0, dragFromLock(dx, g.lockDx));
      samples.current.push({ x: t.clientX, t: performance.now() });
      if (samples.current.length > 12) samples.current.shift();
      if (!reducedMotion()) paint(offset.current);
    };

    const onEnd = (e: TouchEvent) => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.axis !== 'horizontal') return;
      if (!g.dismiss) {
        // Photo navigation, unchanged: 40px between photos.
        const end = e.changedTouches[0]?.clientX;
        if (end == null) return;
        const dx = end - g.x;
        if (dx <= -40 && index < photos.length - 1) onIndex(index + 1);
        if (dx >= 40 && index > 0) onIndex(index - 1);
        return;
      }
      // A drag that springs back leaves a synthetic click on whatever it started
      // on — a chevron would change photos behind the user's back.
      if (offset.current > 0) suppressNextClick();
      samples.current.push({ x: g.x + g.lockDx + offset.current, t: performance.now() });
      const { recentDx, dt, velocity } = release();
      const width = el.clientWidth || window.innerWidth;
      const o = offset.current;
      if (photoDismissCommits(o, width, recentDx, dt, photos.length)) close(velocity);
      else springBack(velocity);
    };

    const onCancel = () => {
      const g = gesture.current;
      gesture.current = null;
      if (g?.dismiss) springBack(0); // iOS took the gesture (native scroll)
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      gesture.current = null;
      clear();
    };
  }, [index, photos.length, onClose, onIndex]);

  if (!photo) return null;

  return (
    <div ref={rootRef} className={s.viewer} role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className={s.viewerBar}>
        <ViewerBackButton onClose={onClose} />
        <span className={s.viewerCount}>
          {index + 1} of {photos.length}
        </span>
        <span style={{ width: 44 }} aria-hidden />
      </div>

      <div className={s.viewerStage}>
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

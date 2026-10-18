'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { INTRO_VIDEO_SRC, INTRO_POSTER_SRC, INTRO_ASPECT } from '@/lib/intro-media';

// The looping app demo. The clip already contains the iPhone frame and a solid
// #fff8f0 background (same as the page), so there is no CSS bezel here — it
// would be a phone inside a phone. Reduced motion shows the poster instead.
export default function IntroHero() {
  const [reduced, setReduced] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Pause when the tab is hidden so the loop doesn't burn battery.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onVis = () => (document.hidden ? v.pause() : v.play().catch(() => {}));
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reduced]);

  const showVideo = !!INTRO_VIDEO_SRC && !reduced;
  const showPoster = !!INTRO_POSTER_SRC && !showVideo;
  const mediaClass = 'h-full w-auto max-w-full object-contain';

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      {showVideo && (
        <video
          ref={videoRef}
          src={INTRO_VIDEO_SRC!}
          poster={INTRO_POSTER_SRC ?? undefined}
          autoPlay loop muted playsInline preload="auto"
          aria-label="Demo: creating an invoice and snapping a receipt"
          className={mediaClass}
          style={{ aspectRatio: INTRO_ASPECT }}
        />
      )}
      {showPoster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={INTRO_POSTER_SRC!} alt="On It receipt logged in chat" className={mediaClass} style={{ aspectRatio: INTRO_ASPECT }} />
      )}
      {!showVideo && !showPoster && (
        <div
          className="flex h-full max-h-[404px] flex-col items-center justify-center gap-2.5 rounded-[34px] bg-[repeating-linear-gradient(135deg,#f5eddf_0_7px,#efe7da_7px_14px)] text-center"
          style={{ aspectRatio: '193/404' }}
        >
          <Icon name="mic" size={26} className="text-primary" />
          <span className="text-xs font-semibold text-on-surface-variant">Demo loop</span>
        </div>
      )}
    </div>
  );
}

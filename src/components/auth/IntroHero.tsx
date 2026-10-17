'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { INTRO_VIDEO_SRC, INTRO_POSTER_SRC } from '@/lib/intro-media';

// The looping app demo inside a phone frame. Reduced motion shows the poster
// (or the placeholder) instead of playing video.
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

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[47%] h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle,#f0e3b8 0%,rgba(240,227,184,.5) 40%,rgba(240,227,184,0) 70%)' }}
      />
      <div
        className="relative aspect-[193/404] h-full max-h-[404px] rounded-[34px] bg-on-background p-1.5"
        style={{ boxShadow: '0 28px 48px -16px rgba(115,92,0,.32), 0 2px 6px rgba(31,27,19,.14)' }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-[28px] bg-surface-container">
          {showVideo && (
            <video
              ref={videoRef}
              src={INTRO_VIDEO_SRC!}
              poster={INTRO_POSTER_SRC ?? undefined}
              autoPlay loop muted playsInline preload="metadata"
              aria-label="Demo: creating an invoice and snapping a receipt"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {showPoster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={INTRO_POSTER_SRC!} alt="On It invoice screen" className="absolute inset-0 h-full w-full object-cover" />
          )}
          {!showVideo && !showPoster && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[repeating-linear-gradient(135deg,#f5eddf_0_7px,#efe7da_7px_14px)] text-center">
              <Icon name="mic" size={26} className="text-primary" />
              <span className="text-xs font-semibold text-on-surface-variant">Demo loop</span>
            </div>
          )}
          <div className="absolute left-1/2 top-2 h-4 w-[54px] -translate-x-1/2 rounded-[10px] bg-on-background" />
        </div>
      </div>
    </div>
  );
}

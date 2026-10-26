'use client';
// Step 1 · What you win — the mockup's reel: one scene per 4.2s, a track that
// belongs to the current scene and a dot per scene behind it. The wall opens
// on the scene its variant names (START_SCENE in PaywallModal), so an estimate
// limit lands on the estimate story.
//
// The track fills over the same 4.2s the timer runs (oi-bar, globals.css), and
// it restarts on every scene. Reduce Motion turns the reel off (no
// auto-advance) and, with animations killed, leaves the track empty and each
// scene in its resting state; the dots still switch scenes, because that is the
// user's own tap.
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import ShowcaseScene, { SCENES, type SceneId } from '@/components/paywall/ShowcaseScenes';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';

/** The mockup's beat: one scene per 4.2s, its track filling the whole time. */
const REEL_MS = 4200;

const SCENE_LABEL: Record<SceneId, string> = {
  invoice: 'Invoice',
  estimate: 'Estimate',
  payments: 'Payment apps',
  recap: 'Recap',
};

export default function ShowcaseStep({
  reason,
  start,
}: {
  /** The wall's reason pill (a soft prompt may have replaced the variant's). */
  reason: string;
  /** The scene this wall opens on — always one of SCENES. */
  start: SceneId;
}) {
  const [idx, setIdx] = useState(() => Math.max(0, SCENES.indexOf(start)));
  const reduced = usePrefersReducedMotion();
  const scene = SCENES[Math.min(idx, SCENES.length - 1)];

  // One beat per scene, then the next one (wrapping). Reduce Motion: no
  // auto-advance at all — the reel rests on the opening scene.
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % SCENES.length), REEL_MS);
    return () => clearTimeout(t);
  }, [idx, reduced]);

  return (
    <div className="flex flex-col items-center gap-3.5 px-4 pb-4 pt-1">
      {/* The reason pill, to the mockup: white capsule on the page cream, a
          hairline border, one gold receipt mark, and the variant's words. */}
      <p className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-surface-container-lowest px-[13px] py-[7px] text-[12.5px] font-semibold leading-none text-on-surface-variant">
        <Icon name="receipt_long" size={17} className="text-primary" />
        {reason}
      </p>

      <div className="w-full">
        <ShowcaseScene id={scene} key={scene} />
      </div>

      {/* The reel: the current scene's 24×6 track, filling as the scene reads,
          then a 6×6 dot per scene. A tap jumps to that scene and restarts the
          beat. */}
      <div role="group" aria-label="Reel" className="flex items-center gap-0.5">
        {SCENES.map((id, i) => (
          <button
            key={id}
            type="button"
            aria-label={SCENE_LABEL[id]}
            aria-current={i === idx ? 'true' : undefined}
            onClick={() => setIdx(i)}
            className="flex cursor-pointer border-0 bg-transparent px-[3px] py-[10px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {i === idx ? (
              <span className="block h-1.5 w-6 overflow-hidden rounded-full bg-reel">
                {/* The beat's fill, restarted on every scene (key). Resting
                    state is the empty track, so Reduce Motion leaves it so. */}
                <span
                  key={idx}
                  className="block h-full w-full origin-left scale-x-0 rounded-full bg-on-background"
                  style={{ animation: 'oi-bar 4.2s cubic-bezier(.3,.6,.4,1) both' }}
                />
              </span>
            ) : (
              <span className="block h-1.5 w-1.5 rounded-full bg-reel" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

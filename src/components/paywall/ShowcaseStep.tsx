'use client';
// Step 1 · What you win — the mockup's reason pill over the scene the wall
// opens on, with the reel's track at rest. Artwork only for now: the four
// scenes live in ShowcaseScenes.tsx, and the 4.2s reel, the oi-* keyframes and
// the step's entrance are their own commits.
//
// The opening scene follows the wall's variant (START_SLIDE in PaywallModal),
// so an estimate cap opens on the estimate story again; a scene that the build
// does not carry (recaps off) falls back to the first one.
import Icon from '@/components/Icon';
import ShowcaseScene, { SCENES, type SceneId } from '@/components/paywall/ShowcaseScenes';

export default function ShowcaseStep({
  reason,
  start,
}: {
  /** The wall's reason pill (a soft prompt may have replaced the variant's). */
  reason: string;
  /** The scene this wall opens on — always one of SCENES. */
  start: SceneId;
}) {
  const scene = SCENES.includes(start) ? start : SCENES[0];
  const active = SCENES.indexOf(scene);

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

      {/* The reel, at rest: the opening scene's track (not yet filling) and a
          dot per scene behind it. The 4.2s fill and the scene swap come with
          the reel; the slots are already the mockup's tap areas. */}
      <div aria-hidden className="flex items-center gap-0.5">
        {SCENES.map((id, i) => (
          <span key={id} className="flex px-[3px] py-[10px]">
            <span
              className={
                i === active
                  ? 'block h-1.5 w-6 rounded-full bg-reel'
                  : 'block h-1.5 w-1.5 rounded-full bg-reel'
              }
            />
          </span>
        ))}
      </div>
    </div>
  );
}

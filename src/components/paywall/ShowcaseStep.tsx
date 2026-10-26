'use client';
// Step 1 · What you win — the mockup's static layout, nothing moving: the
// reason pill, a left-aligned headline and subtitle, one demo tile on the warm
// #faefdc band, and the reel track at rest. This replaces the old centred
// "What you win" title and the slideshow carousel it sat over.
//
// Not ported yet (the reel step owns them): the four scenes, their 4.2s beat,
// and the mockup's oi-* keyframes — the entry slide, the typed line, the
// staged line items, the total counting up, the APPROVED stamp. What is on
// screen here is the invoice story at its end state, so the tile reads as a
// finished invoice rather than an animation caught mid-flight.
import Icon from '@/components/Icon';
import { RECAPS_LIVE } from '@/lib/recaps-live';

// How many scenes the reel will carry: the recaps story is live-only, so the
// track must not promise a fourth scene when RECAPS_LIVE is off.
const SCENES = RECAPS_LIVE ? 4 : 3;

export default function ShowcaseStep({
  reason,
}: {
  /** The wall's reason pill (a soft prompt may have replaced the variant's). */
  reason: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3.5 px-4 pb-4 pt-1">
      {/* The reason pill, to the mockup: white capsule on the page cream, a
          hairline border, one gold receipt mark, and the variant's words. */}
      <p className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-hairline bg-surface-container-lowest px-[13px] py-[7px] text-[12.5px] font-semibold leading-none text-on-surface-variant">
        <Icon name="receipt_long" size={17} className="text-primary" />
        {reason}
      </p>

      <div className="flex w-full flex-col gap-3">
        {/* Two lines reserved, so the tile sits still from scene to scene. */}
        <div className="min-h-[78px]">
          <h2
            id="paywall-step-title"
            tabIndex={-1}
            className="font-display text-[25px] font-extrabold leading-[1.15] tracking-[-0.02em] outline-none"
          >
            Say it. It’s invoiced.
          </h2>
          <p className="mt-1.5 text-[14.5px] leading-[1.45] text-on-surface-variant [text-wrap:pretty]">
            Talk through the job. On It writes the invoice.
          </p>
        </div>

        {/* The demo tile: one invoice story, already finished. */}
        <div className="flex h-[432px] flex-col gap-3.5 overflow-hidden rounded-[20px] bg-tile px-4 py-[18px]">
          <div className="flex items-center gap-[11px] rounded-full border border-hairline bg-surface-container-lowest py-1.5 pl-1.5 pr-3.5">
            <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-primary-container">
              <Icon name="mic" size={21} filled className="text-on-background" />
            </span>
            {/* The mockup types this line on one row; at rest the whole
                sentence is there, so it wraps rather than clipping the
                amount on a 375px phone. */}
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-[1.3]">
              “Invoice Mike Davis, back door install, 850”
            </span>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-container-lowest p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-[#2b2721] text-xs font-bold leading-none text-background">
                RH
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold leading-[1.2]">Reyes Home Repair</div>
                <div className="mt-[3px] text-[10.5px] font-semibold uppercase leading-[1.2] tracking-[.1em] text-on-surface-variant">
                  Invoice
                </div>
              </div>
              <span className="font-mono text-xs font-medium leading-none text-on-surface-variant">INV-0081</span>
            </div>

            <span className="h-px bg-hairline" />

            <div>
              <div className="text-[10.5px] font-semibold uppercase leading-none tracking-[.1em] text-on-surface-variant">
                Bill to
              </div>
              <div className="mt-[5px] font-display text-[18px] font-extrabold leading-[1.2]">Mike Davis</div>
            </div>

            <div className="flex flex-col gap-2 font-mono text-[13.5px] leading-[1.3]">
              <div className="flex justify-between">
                <span>Back door install</span>
                <span>$780.00</span>
              </div>
              <div className="flex justify-between">
                <span>Hardware &amp; trim</span>
                <span>$70.00</span>
              </div>
            </div>

            <div className="flex items-baseline justify-between border-t-[1.5px] border-dashed border-dash pt-2.5">
              <span className="text-[13px] font-semibold leading-none text-on-surface-variant">Total</span>
              <span className="font-display text-[28px] font-extrabold leading-none tabular-nums text-primary">
                $850.00
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* The reel, at rest: the current scene's track (not yet filling) and a
          dot per scene behind it. The 4.2s fill and the scene swap come with
          the reel; the slots are already the mockup's tap areas. */}
      <div aria-hidden className="flex items-center gap-0.5">
        {Array.from({ length: SCENES }, (_, i) => (
          <span key={i} className="flex px-[3px] py-[10px]">
            <span
              className={
                i === 0
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

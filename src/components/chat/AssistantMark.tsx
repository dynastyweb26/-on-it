'use client';
// The On It monogram: a charcoal tile with the O and a 4px gold dot, shown once
// beside the first assistant message of a run (not on every bubble). While On It
// is still writing, a hairline gold ring breathes out of it — transform/opacity
// only, so it never nudges the transcript. Decorative: the message text carries
// the meaning, so it is hidden from assistive tech.
export default function AssistantMark({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`onit-mark mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] bg-inverse-surface font-display text-[11px] font-extrabold leading-none text-inverse-on-surface${
        pulsing ? ' is-pulsing' : ''}`}
    >
      O
      <span className="onit-mark-dot" />
    </span>
  );
}

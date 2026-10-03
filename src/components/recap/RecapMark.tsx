// The recap's thumbnail: the gold swoosh on ink in a circle. While the recap
// is unwatched it wears a gold ring with a hairline gap (the "new story" ring);
// once watched the ring goes quiet. Decorative (the row's text says it all).
// #d4af37 is a border here, never text (RECAP-SPEC §0).
export default function RecapMark({ size = 52, ring }: { size?: number; ring: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full border-2 p-[2px] ${ring ? 'border-[#d4af37]' : 'border-outline-variant'}`}
      style={{ width: size, height: size }}
    >
      <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-inverse-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/recap/swoosh-gold.svg" alt="" draggable={false} style={{ width: '74%', height: 'auto' }} />
      </span>
    </span>
  );
}

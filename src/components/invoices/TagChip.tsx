'use client';

// The document chip in the invoices list. Same look as before; the only
// addition is the one transition worth animating: SIGNED → CONVERTED, a 200 ms
// crossfade, because that chip changes without the row moving and the eye
// should catch it.
//
// Deliberately NOT a fade on every state change: the list keys the chip by
// state and switches instantly everywhere else, and a fade on 200 rows at once
// was already rejected in this file's history (one animation per row).
import { useEffect, useRef, useState } from 'react';
import '@/components/alive/alive.css';
import '@/components/alive/alive.css';
import Icon from '@/components/Icon';
import type { IconName } from '@/components/icon-names';

const CROSSFADE_MS = 200;

export default function TagChip({
  tagKey,
  text,
  cls,
  icon,
}: {
  tagKey: string;
  text: string;
  cls: string;
  icon: IconName;
}) {
  const previous = useRef(text);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [fading, setFading] = useState(false);
  // Design 07: after SIGNED -> CONVERTED the new chip pulses a gold halo twice.
  const [halo, setHalo] = useState(false);

  useEffect(() => {
    const was = previous.current;
    previous.current = text;
    if (was !== 'SIGNED' || text !== 'CONVERTED') return;
    setOutgoing(was);
    setHalo(true);
    setFading(false);
    const frame = requestAnimationFrame(() => setFading(true));
    const done = setTimeout(() => { setOutgoing(null); setFading(false); }, CROSSFADE_MS + 40);
    return () => { cancelAnimationFrame(frame); clearTimeout(done); };
  }, [text]);

  const shell = `inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[11px] font-bold tracking-[.06em] ${cls}`;

  const haloStyle = halo ? { animation: 'al-chip-halo 1.6s ease-out 2' } : undefined;
  if (!outgoing) {
    return (
      <span key={tagKey} className={shell} style={haloStyle} onAnimationEnd={() => setHalo(false)}>
        <Icon name={icon} size={14} />{text}
      </span>
    );
  }

  // The old label fades out over the new one inside the same 24px box, so the
  // row never reflows mid-transition.
  return (
    <span className="relative inline-flex h-6 items-center">
      <span
        className={shell}
        style={{ opacity: fading ? 1 : 0, transition: `opacity ${CROSSFADE_MS}ms linear`, ...haloStyle }}
      >
        <Icon name={icon} size={14} />{text}
      </span>
      <span
        aria-hidden
        className={`${shell} absolute inset-0`}
        style={{ opacity: fading ? 0 : 1, transition: `opacity ${CROSSFADE_MS}ms linear` }}
      >
        <Icon name={icon} size={14} />{outgoing}
      </span>
    </span>
  );
}

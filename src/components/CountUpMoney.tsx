'use client';

// A money figure that counts up from 0 when `run` turns on (MOTION-SPEC.md §3),
// then tracks `value` normally. Only the first appearance counts; edits after
// that just show the new value. Reduced motion (or a non-finite value) shows
// the final figure immediately.
import { useEffect, useRef, useState } from 'react';

export default function CountUpMoney({
  value,
  run,
  format,
  delayMs = 0,
  durationMs = 600,
}: {
  value: number;
  run: boolean;
  format: (n: number) => string;
  delayMs?: number;
  durationMs?: number;
}) {
  const [shown, setShown] = useState<number | null>(run ? 0 : null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!run) { setShown(null); return; }
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(valueRef.current)) { setShown(null); return; }
    setShown(0);
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const q = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - Math.pow(1 - q, 3);
      if (q < 1) {
        setShown(valueRef.current * eased);
        raf = requestAnimationFrame(step);
      } else {
        setShown(null); // hand back to the live value
      }
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(step); }, delayMs);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    // Deliberately keyed on `run` only: a value change mid-count is picked up
    // through valueRef, and must not restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return <>{format(shown ?? value)}</>;
}

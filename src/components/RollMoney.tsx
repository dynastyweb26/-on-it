'use client';
// A money figure that rolls from `from` to its current `value` when `run`
// turns on (M4 "Invoice marked paid": the amount rolls after the stamp lands),
// then simply shows `value`. Reduced motion, or no `from`, shows the value.
import { useEffect, useRef, useState } from 'react';

export default function RollMoney({ value, from, run, format, delayMs = 0, durationMs = 700 }: {
  value: number;
  from: number | null;
  run: boolean;
  format: (n: number) => string;
  delayMs?: number;
  durationMs?: number;
}) {
  const [shown, setShown] = useState<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (!run || from == null) { setShown(null); return; }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(from)) { setShown(null); return; }
    setShown(from);
    let raf = 0;
    let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const q = Math.min(1, Math.max(0, (ts - start - delayMs) / durationMs));
      const eased = 1 - Math.pow(1 - q, 3);
      setShown(from + (valueRef.current - from) * eased);
      if (q < 1) raf = requestAnimationFrame(step); else setShown(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, from, delayMs, durationMs]);
  return <>{format(shown ?? value)}</>;
}

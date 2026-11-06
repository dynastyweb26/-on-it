'use client';
// The reveal for On It's prose. There is no stream yet (the parse route answers
// with one JSON body), so this types the finished sentence out at reading speed;
// `streaming` is here so a real stream can drive the same component later — it
// then follows `text` as it grows instead of racing a fixed schedule.
//
// Only PROSE goes through this. Errors, cards, quick replies and anything
// actionable render at once, outside the component: a tap must never wait for a
// caret. A tap on the text itself completes it, so a reader is never held up.
//
// Timings (motion inventory): ~38 cps for anything long, ~85 cps for a short
// canned line, a 170ms stop after . ! ? and an em dash, and a hard 1800ms ceiling
// — long text speeds up and gives up its pauses rather than overrun it.
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { reducedMotion } from '@/lib/list-motion';

const BASE_CPS = 38;
const CANNED_CPS = 85;
const SHORT_MAX = 60; // about one line
const PAUSE_MS = 170;
const MAX_MS = 1800;
const PAUSE_AFTER = /[.!?…]|—/;

/** Characters per second and per-stop pause for this text, fitted to MAX_MS. */
export function revealTiming(chars: string[], streaming: boolean): { step: number; pause: number } {
  const n = chars.length || 1;
  const cps = streaming ? BASE_CPS : n <= SHORT_MAX ? CANNED_CPS : BASE_CPS;
  let step = 1000 / cps;
  let pause = PAUSE_MS;
  let stops = 0;
  for (const c of chars) if (PAUSE_AFTER.test(c)) stops++;
  if (!streaming) {
    const base = n * step;
    if (base + stops * pause > MAX_MS) {
      if (base >= MAX_MS) {
        step = MAX_MS / n;
        pause = 0;
      } else {
        pause = Math.min(PAUSE_MS, (MAX_MS - base) / stops);
      }
    }
  }
  return { step, pause };
}

// Layout effect in the browser, so reduced motion shows the whole sentence on
// the first paint instead of a blank bubble; plain effect during SSR.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function StreamText({
  text,
  streaming = false,
  className = '',
}: {
  text: string;
  /** A real stream will drive this later: the reveal follows the text as it grows. */
  streaming?: boolean;
  /** Type/colour only — the bubble owns the shell. */
  className?: string;
}) {
  const chars = useMemo(() => Array.from(text), [text]);
  const [shown, setShown] = useState(0);

  const finish = useCallback(() => setShown(chars.length), [chars.length]);

  useIsoLayoutEffect(() => {
    if (reducedMotion()) {
      setShown(chars.length);
      return;
    }
    if (shown >= chars.length) return;
    const ch = chars[shown];
    const { step, pause } = revealTiming(chars, streaming);
    const delay = step + (ch && PAUSE_AFTER.test(ch) ? pause : 0);
    const t = setTimeout(() => setShown((n) => Math.min(n + 1, chars.length)), delay);
    return () => clearTimeout(t);
  }, [shown, chars, streaming]);

  // The caret belongs to the reveal, not the message: it is gone the moment the
  // last character lands, and reduced motion never draws one.
  const revealing = shown < chars.length || streaming;

  return (
    <span className={`block${className ? ` ${className}` : ''}`} onClick={finish}>
      {revealing ? (
        <>
          {/* The visible half is hidden from assistive tech; the full sentence is
              exposed once, so a screen reader never reads a half-written line. */}
          <span aria-hidden="true">{chars.slice(0, shown).join('')}</span>
          <span className="sr-only">{text}</span>
          <span aria-hidden="true" className="onit-caret" />
        </>
      ) : (
        text
      )}
    </span>
  );
}

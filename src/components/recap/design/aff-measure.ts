// Text measuring for affLayout, as the design does it: a canvas 2D context.
// `family` is the page's resolved Montserrat (next/font gives it a hashed name,
// so the slide reads it from the --onit-display variable).
import type { Measure } from '@/components/recap/design/aff-layout';

export function canvasMeasure(family: string): Measure {
  const ctx = document.createElement('canvas').getContext('2d');
  return (text, weight, px) => {
    if (!ctx) return approxMeasure(text, weight, px);
    ctx.font = `${weight} ${px}px ${family}`;
    return ctx.measureText(text).width;
  };
}

/** Montserrat's average advance: the first paint and the server render, until the real fonts measure. */
export const approxMeasure: Measure = (text, weight, px) => text.length * px * (weight === 800 ? 0.64 : 0.58);

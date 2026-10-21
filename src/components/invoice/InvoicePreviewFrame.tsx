'use client';

// Shared on-screen preview for the real A4 invoice templates. The PDF renderer
// still uses its own full-size node; this only scales a presentational copy into
// a frame and never carries the html2canvas capture ref.
//
// Two fit modes:
//   height — fixed height (Settings), width derived from A4 and centered.
//   width  — fit the available width (invoice detail), capped at maxScale so
//            desktop keeps the previous preview size.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { InvoiceTemplate, type InvoiceRenderData, type TemplateKey } from '@/lib/pdf/templates';
import type { BrandTheme } from '@/lib/colors';

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

// Measure before paint on the client, but don't warn during SSR.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function InvoicePreviewFrame({
  template,
  data,
  theme,
  fit,
  maxHeight,
  maxScale,
  frameClassName = 'rounded-2xl',
  dimmed = false,
  ariaHidden = false,
  overlay,
}: {
  template: TemplateKey;
  data: InvoiceRenderData;
  theme: BrandTheme;
  fit: 'height' | 'width';
  maxHeight?: number;
  maxScale?: number;
  frameClassName?: string;
  dimmed?: boolean;
  ariaHidden?: boolean;
  overlay?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useIsoLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  let frameW = 0;
  let frameH = 0;
  if (available > 0) {
    if (fit === 'height') {
      const height = maxHeight ?? 340;
      frameW = (height * A4_WIDTH) / A4_HEIGHT;
      frameH = height;
      if (frameW > available) {
        frameW = available;
        frameH = (frameW * A4_HEIGHT) / A4_WIDTH;
      }
    } else {
      const cap = maxScale ? A4_WIDTH * maxScale : available;
      frameW = Math.min(available, cap);
      frameH = (frameW * A4_HEIGHT) / A4_WIDTH;
    }
  }

  const scale = frameW > 0 ? frameW / A4_WIDTH : 0;
  const reservedHeight = available > 0
    ? frameH
    : fit === 'height' ? maxHeight : undefined;

  return (
    <div
      ref={wrapRef}
      className="flex w-full justify-center"
      style={{ minHeight: reservedHeight }}
    >
      {frameW > 0 && (
        <div
          className={`relative overflow-hidden bg-surface-container-lowest ring-1 ring-outline-variant ${frameClassName}`}
          style={{ width: frameW, height: frameH }}
        >
          <div
            aria-hidden={ariaHidden || undefined}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: A4_WIDTH,
              height: A4_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              opacity: dimmed ? 0.35 : 1,
              transition: 'opacity 200ms',
            }}
          >
            <InvoiceTemplate template={template} data={data} theme={theme} />
          </div>
          {overlay}
        </div>
      )}
    </div>
  );
}

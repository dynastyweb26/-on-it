'use client';

// Draw tab (design spec §2.3): 168px pad, 2x canvas for sharpness, pointer
// events with touch-action:none, a baseline rule with a small x, and a
// placeholder while empty. Exports a PNG data URL; the sign route accepts a
// transparent PNG, so no paper fill is painted.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import s from './estimate.module.css';

export type SignaturePadHandle = { clear: () => void };

// The design's 2x rule for a sharp ink edge.
const SCALE = 2;

const SignaturePad = forwardRef<SignaturePadHandle, { onChange: (dataUrl: string | null) => void }>(
  function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const painted = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);
    // Keep the latest callback without re-running the canvas setup effect.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const setup = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(rect.width * SCALE));
        canvas.height = Math.max(1, Math.round(rect.height * SCALE));
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1E1A15';
        painted.current = false;
        setEmpty(true);
        onChangeRef.current(null);
      };

      setup();
      const observer = new ResizeObserver(setup);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, []);

    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        painted.current = false;
        last.current = null;
        setEmpty(true);
        onChangeRef.current(null);
      },
    }));

    const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    return (
      <div className={s.padWrap}>
        <canvas
          ref={canvasRef}
          className={s.pad}
          aria-label="Signature pad"
          onPointerDown={(e) => {
            const ctx = e.currentTarget.getContext('2d');
            if (!ctx) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const p = point(e);
            last.current = p;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            // A tap still leaves a mark: a zero-length segment draws the round cap.
            ctx.lineTo(p.x + 0.01, p.y);
            ctx.stroke();
            painted.current = true;
            setEmpty(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext('2d');
            const from = last.current;
            if (!ctx || !from) return;
            const p = point(e);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            painted.current = true;
          }}
          onPointerUp={(e) => {
            drawing.current = false;
            last.current = null;
            if (painted.current) onChangeRef.current(e.currentTarget.toDataURL('image/png'));
          }}
          onPointerCancel={() => {
            drawing.current = false;
            last.current = null;
          }}
        />
        <span className={s.padBaseline} aria-hidden />
        <span className={s.padX} aria-hidden>
          ×
        </span>
        {empty && (
          <span className={s.padPlaceholder} aria-hidden>
            Sign here with your finger
          </span>
        )}
      </div>
    );
  },
);

export default SignaturePad;

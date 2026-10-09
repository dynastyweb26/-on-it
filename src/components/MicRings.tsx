'use client';

// Rings behind the mic button that follow the live input level while
// recording (MOTION-SPEC.md §11). Reads the SAME stream the recorder uses via
// a Web Audio AnalyserNode, ~9 updates/sec, and writes transforms straight to
// the ring elements (no React re-render per frame). If audio analysis isn't
// available or the AudioContext stays suspended (some iOS cases), it falls
// back to the old fixed pulse. Reduced motion: one static ring.
import { useEffect, useRef, useState } from 'react';

/** `tone` is the rings' RGB triplet ("r, g, b"); gold by default. */
export default function MicRings({ stream, active, tone = '212, 175, 55' }: { stream: MediaStream | null; active: boolean; tone?: string }) {
  const r1 = useRef<HTMLSpanElement>(null);
  const r2 = useRef<HTMLSpanElement>(null);
  const r3 = useRef<HTMLSpanElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (!active || !stream) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      if (r1.current) r1.current.style.transform = 'scale(1.12)';
      return;
    }
    const set = (el: HTMLSpanElement | null, scale: number, opacity?: number) => {
      if (!el) return;
      el.style.transform = `scale(${scale.toFixed(3)})`;
      if (opacity !== undefined) el.style.opacity = opacity.toFixed(2);
    };
    let ctx: AudioContext | null = null;
    let raf = 0;
    let last = 0;
    let lag = 0;
    let cancelled = false;
    let fellBack = false;
    const fallBack = () => { if (!fellBack) { fellBack = true; setFallback(true); } };
    try {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) { fallBack(); return; }
      ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      void ctx.resume?.().catch(() => { /* handled by the running check */ });
      const startedAt = performance.now();
      const tick = (ts: number) => {
        if (cancelled) return;
        raf = requestAnimationFrame(tick);
        if (ts - last < 110) return;
        last = ts;
        if (ctx?.state !== 'running') {
          if (ts - startedAt > 600) fallBack();
          return;
        }
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        lag = lag * 0.6 + level * 0.4;
        set(r1.current, 1.08 + level * 0.22, 1);
        set(r2.current, 1.16 + lag * 0.34, 1);
        set(r3.current, 1.24 + lag * 0.5, 0.6 + lag * 0.4);
      };
      raf = requestAnimationFrame(tick);
    } catch {
      fallBack();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      void ctx?.close().catch(() => { /* already closed */ });
      setFallback(false);
    };
  }, [active, stream]);

  if (!active) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {fallback ? (
        <span className="voice-listening absolute inset-0 rounded-full" />
      ) : (
        <>
          <span ref={r3} className="onit-mic-ring" style={{ background: `rgba(${tone}, 0.16)`, opacity: 0 }} />
          <span ref={r2} className="onit-mic-ring" style={{ background: `rgba(${tone}, 0.26)` }} />
          <span ref={r1} className="onit-mic-ring" style={{ background: `rgba(${tone}, 0.38)` }} />
        </>
      )}
    </span>
  );
}

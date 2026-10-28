'use client';
/* ═══ In-app receipt camera ═══
   A full-screen viewfinder for photographing a receipt, built on getUserMedia
   so it ships through Vercel with no native rebuild.

   The sheet mounts already open (ChatView renders it only while the camera is
   wanted) and unmounting is the close path — which is why the stream lives in
   a ref owned by one effect: every exit (X, Use photo, gallery, unmount, route
   change) runs the same cleanup and stops every track, so no camera light is
   left on.

   The photo it produces is a plain JPEG File. It goes straight into the receipt
   pipeline ChatView already has (prepareReceipt → dedup → parse → expense), so
   nothing downstream knows or cares that the camera was in-app. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import OnItSpinner from '@/components/OnItSpinner';
import {
  CAPTURE_QUALITY,
  MAX_CAPTURE_EDGE,
  blockerFromError,
  cameraEnvironment,
  cameraFailureCopy,
  canFlip,
  fitWithin,
  flipLabel,
  nextFacing,
  receiptFileName,
  videoConstraints,
  type CameraFailure,
  type Facing,
} from '@/lib/receipt-camera';

type Mode = 'opening' | 'live' | 'review' | 'blocked';

export default function ReceiptCamera({ onClose, onPhoto, onPickFromLibrary }: {
  onClose: () => void;
  /** The captured photo, ready for the existing receipt pipeline. */
  onPhoto: (file: File) => void;
  /** Fallback: the composer's own gallery picker. */
  onPickFromLibrary: () => void;
}) {
  const [mode, setMode] = useState<Mode>('opening');
  const [failure, setFailure] = useState<CameraFailure>('unavailable');
  const [facing, setFacing] = useState<Facing>('environment');
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [flippable, setFlippable] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotUrlRef = useRef<string | null>(null);
  // Set once this sheet is on its way out. Every async continuation (a late
  // getUserMedia, a toBlob, an enumerateDevices) checks it and does nothing, so
  // a stream can never be attached — or left running — after close.
  const closedRef = useRef(false);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.onended = null;
        try { track.stop(); } catch { /* already ended */ }
      }
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const dropShot = useCallback(() => {
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
    shotUrlRef.current = null;
    setShot(null);
  }, []);

  const syncFlippable = useCallback(async () => {
    const media = navigator.mediaDevices;
    if (!media?.enumerateDevices) return;
    try {
      const devices = await media.enumerateDevices();
      if (!closedRef.current) setFlippable(canFlip(devices.filter((d) => d.kind === 'videoinput').length));
    } catch { /* unknown count → no flip button */ }
  }, []);

  const startStream = useCallback(async (want: Facing) => {
    const support = cameraEnvironment({
      isSecureContext: window.isSecureContext,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
    });
    if (support !== 'ok') {
      setFailure(support);
      setMode('blocked');
      return;
    }

    stopStream();
    setMode('opening');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(videoConstraints(want));
      if (closedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try { await video.play(); } catch { /* autoplay refused: the frame stays blank */ }
      }
      if (closedRef.current) { stopStream(); return; }
      setMode('live');
      void syncFlippable();
    } catch (err) {
      if (closedRef.current) return;
      setFailure(blockerFromError(err));
      setMode('blocked');
    }
  }, [stopStream, syncFlippable]);

  // One effect owns the stream's lifetime: acquire on mount, stop on unmount.
  useEffect(() => {
    closedRef.current = false;
    void startStream('environment');
    return () => {
      closedRef.current = true;
      stopStream();
      if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
      shotUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const close = useCallback(() => {
    closedRef.current = true;
    stopStream();
    onClose();
  }, [onClose, stopStream]);

  const pickLibrary = useCallback(() => {
    closedRef.current = true;
    stopStream();
    onPickFromLibrary();
  }, [onPickFromLibrary, stopStream]);

  const retry = useCallback(() => {
    setFailure('unavailable');
    void startStream(facing);
  }, [facing, startStream]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || mode !== 'live') return;
    const { width, height } = fitWithin(video.videoWidth, video.videoHeight, MAX_CAPTURE_EDGE);
    if (!width || !height) return;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', CAPTURE_QUALITY));
    // Free the pixels before the review state renders.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || closedRef.current) return;

    const file = new File([blob], receiptFileName(), { type: 'image/jpeg', lastModified: Date.now() });
    const url = URL.createObjectURL(blob);
    shotUrlRef.current = url;
    setShot({ file, url });
    setMode('review');
  }, [mode]);

  const retake = useCallback(() => {
    dropShot();
    // The stream is normally still live behind the review; if the device took
    // it away (another app, a lock), ask for it again rather than showing a
    // dead frame.
    if (streamRef.current?.active) setMode('live');
    else void startStream(facing);
  }, [dropShot, facing, startStream]);

  const usePhoto = useCallback(() => {
    if (!shot) return;
    const { file } = shot;
    closedRef.current = true;
    dropShot();
    stopStream();
    onPhoto(file);
  }, [dropShot, onPhoto, shot, stopStream]);

  const flip = useCallback(() => {
    const want = nextFacing(facing);
    setFacing(want);
    void startStream(want);
  }, [facing, startStream]);

  // Escape closes; Tab stays inside the sheet (it covers the whole app).
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [close]);

  // Focus starts on Close so a keyboard or screen reader user is inside the
  // dialog, and never on the shutter (an accidental Enter shouldn't shoot).
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  if (typeof document === 'undefined') return null;

  const copy = cameraFailureCopy(failure);

  if (mode === 'blocked') {
    return createPortal(
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Camera unavailable"
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-[70] grid place-items-center bg-background px-6 text-on-background"
        style={{
          height: '100dvh',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <div className="w-full max-w-sm text-center">
          <Icon name="visibility_off" size={40} className="mx-auto text-primary" />
          <h2 className="mt-4 text-headline-mobile">{copy.title}</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">{copy.body}</p>
          <button type="button" className="btn-primary mt-6 w-full" onClick={pickLibrary}>
            <Icon name="photo_library" size={20} /> Choose from photos
          </button>
          <button type="button" className="btn-outline mt-2 w-full" onClick={retry}>
            Try again
          </button>
          <button type="button" className="mt-2 min-h-touch w-full text-sm text-on-surface-variant underline" onClick={close}>
            Close
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="true"
      aria-label="Photograph a receipt"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[70] flex flex-col bg-on-background text-inverse-on-surface"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-3 pt-2">
        <button
          ref={closeRef}
          type="button"
          aria-label="Close camera"
          onClick={close}
          className="grid h-11 w-11 place-items-center rounded-full bg-inverse-surface/80 text-inverse-on-surface transition active:scale-90"
        >
          <Icon name="close" size={22} />
        </button>
        <span className="text-label-lg font-semibold text-inverse-on-surface/80">Receipt</span>
        <span aria-hidden className="h-11 w-11" />
      </div>

      <div className="relative min-h-0 flex-1">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-hidden
          className={`h-full w-full object-contain ${mode === 'live' ? '' : 'opacity-0'}`}
        />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL from this capture, not a static asset
          <img src={shot.url} alt="The receipt photo you just took" className="absolute inset-0 h-full w-full object-contain" />
        )}
        {mode === 'live' && (
          // Framing guide only: the capture is the whole sensor frame, so this
          // never crops what the read gets.
          <div aria-hidden className="pointer-events-none absolute inset-x-5 inset-y-8 rounded-[24px] border border-inverse-on-surface/25" />
        )}
        {mode === 'opening' && (
          <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
            <OnItSpinner size={32} className="text-primary-fixed" />
            <span className="sr-only">Starting the camera…</span>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 pb-3 pt-2">
        {mode === 'review' ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={retake}
              className="min-h-touch flex-1 rounded-button border border-inverse-on-surface/40 px-6 text-body-md font-semibold text-inverse-on-surface transition active:scale-[0.97]"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={usePhoto}
              className="min-h-touch flex-1 rounded-button bg-background px-6 text-body-md font-semibold text-on-background transition active:scale-[0.97]"
            >
              Use photo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="justify-self-start">
              <button
                type="button"
                aria-label="Choose a receipt from photos instead"
                onClick={pickLibrary}
                className="grid h-11 w-11 place-items-center rounded-full bg-inverse-surface/80 text-inverse-on-surface transition active:scale-90"
              >
                <Icon name="photo_library" size={22} />
              </button>
            </div>
            <button
              type="button"
              aria-label="Take the photo"
              onClick={() => void capture()}
              disabled={mode !== 'live'}
              className="grid h-[76px] w-[76px] place-items-center rounded-full border-4 border-inverse-on-surface/70 transition active:scale-95 disabled:opacity-40"
            >
              <span className="h-[60px] w-[60px] rounded-full bg-background" />
            </button>
            <div className="justify-self-end">
              {flippable && (
                <button
                  type="button"
                  aria-label={flipLabel(facing)}
                  onClick={flip}
                  className="grid h-11 w-11 place-items-center rounded-full bg-inverse-surface/80 text-inverse-on-surface transition active:scale-90"
                >
                  <Icon name="autorenew" size={22} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

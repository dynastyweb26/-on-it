'use client';
/* ═══ In-app receipt camera ═══
   A full-screen viewfinder for photographing a receipt, built on getUserMedia
   so it ships through Vercel with no native rebuild.

   Layout: a bottom sheet 70% of the viewport tall, with 40px top shoulders,
   holding the live video edge to edge. The chat stays visible above it under a
   flat, unclickable scrim — tapping the dimmed app does nothing, so the sheet
   can never be closed by accident. Close, shutter and "more" float over the
   picture at the sheet's bottom edge (the "more" circle unfolds gallery and,
   only with a second camera, flip above itself).

   The sheet mounts already open (ChatView renders it only while the camera is
   wanted) and unmounting is the close path — which is why the stream lives in
   a ref owned by one effect: every exit (close, Use photo, gallery, unmount,
   route change) runs the same cleanup and stops every track, so no camera
   light is left on.

   The screen draws the video with object-cover, so the capture crops to the
   visible rectangle (coverCrop → sx/sy/sw/sh): the photo is the picture the
   user framed, never a letterboxed or widened version of it.

   The photo it produces is a plain JPEG File. It goes straight into the pipeline
   of whichever flow opened it (the receipt one in ChatView: prepareReceipt →
   dedup → parse → expense; the estimate one: prepareEstimateFile), so nothing
   downstream knows or cares that the camera was in-app. The receipt wording is
   the default `copy`; a flow with other words passes its own. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/Icon';
import OnItSpinner from '@/components/OnItSpinner';
import { usePrefersReducedMotion } from '@/lib/use-reduced-motion';
import {
  CAPTURE_QUALITY,
  MAX_CAPTURE_EDGE,
  OPEN_TIMEOUT_MS,
  blockerFromError,
  cameraEnvironment,
  cameraFailureCopy,
  canFlip,
  coverCrop,
  flipLabel,
  isSilentFallback,
  nextFacing,
  receiptFileName,
  videoConstraints,
  type CameraFailure,
  type Facing,
} from '@/lib/receipt-camera';

type Mode = 'opening' | 'live' | 'review' | 'blocked';

/** One shape for every secondary control: 48px, dark translucent, ≥ 44 target. */
const CIRCLE = 'onit-camera-control grid h-12 w-12 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/15 backdrop-blur-md transition active:scale-90';

/** The sheet, in viewport units: the app's top 30% stays visible behind it. */
const SHEET_HEIGHT = '70dvh';
/** Bottom padding for the controls: the safe area is padding here, so the
 *  sheet's own surface still runs all the way to the screen edge. */
const SHEET_INSET = {
  paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
  paddingLeft: 'max(1rem, env(safe-area-inset-left))',
  paddingRight: 'max(1rem, env(safe-area-inset-right))',
} as const;
/** A pill over the frozen photo needs its own dark fill to stay legible on a
 *  white receipt; the outline alone disappears. */
const PILL = 'onit-camera-control min-h-touch rounded-button px-6 text-body-md font-semibold transition active:scale-[0.97]';

/** Motion: the sheet rises, the loader hands over to the live frame, the sheet
 *  drops back down. Transform and opacity only (MOTION-SPEC.md); the global
 *  reduce block in globals.css leaves every one of them at its still state. */
const OPEN_MS = 250;
const CLOSE_MS = 200;
const LOADER_FADE_MS = 150;

/** Everything the sheet says that mentions what is being photographed. The
 *  receipt flow (ChatView) uses these defaults; estimates pass their own so the
 *  screen never talks about receipts over an estimate. */
export interface CameraCopy {
  /** Accessible name of the whole screen. */
  sheet: string;
  /** The gallery control's accessible name. */
  gallery: string;
  /** Description of the frozen photo in review. */
  photoAlt: string;
  /** What the failure screen calls the thing being photographed. */
  subject: string;
}

const DEFAULT_COPY: CameraCopy = {
  sheet: 'Photograph a receipt',
  gallery: 'Choose a receipt from photos instead',
  photoAlt: 'The receipt photo you just took',
  subject: 'the receipt',
};

export default function ReceiptCamera({ onClose, onPhoto, onPickFromLibrary, copy }: {
  onClose: () => void;
  /** The captured photo, ready for the existing receipt pipeline. */
  onPhoto: (file: File) => void;
  /** Fallback: the composer's own gallery picker. */
  onPickFromLibrary: () => void;
  /** The receipt wording, or the flow's own. Defaults to a receipt. */
  copy?: Partial<CameraCopy>;
}) {
  const text: CameraCopy = { ...DEFAULT_COPY, ...copy };
  const [mode, setMode] = useState<Mode>('opening');
  const [failure, setFailure] = useState<CameraFailure>('unavailable');
  const [facing, setFacing] = useState<Facing>('environment');
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [flippable, setFlippable] = useState(false);
  // The more-menu: gallery and flip live in it so the sheet keeps one control
  // row. It is a menu, not a mode — the stream never notices it opens.
  const [menuOpen, setMenuOpen] = useState(false);
  // Motion state. The stream never waits for any of it: it starts on mount, and
  // the sheet is already sliding up around the spinning loader when the first
  // frames arrive.
  const reduced = usePrefersReducedMotion();
  const [closing, setClosing] = useState(false);
  const [loaderMounted, setLoaderMounted] = useState(true);
  // A second tap on the shutter while a frame is still being encoded would
  // capture twice. The ref is the guard; state alone lags a fast double tap.
  const capturingRef = useRef(false);
  const [capturing, setCapturing] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotUrlRef = useRef<string | null>(null);
  // Set once this sheet is on its way out. Every async continuation (a late
  // getUserMedia, a toBlob, an enumerateDevices) checks it and does nothing, so
  // a stream can never be attached — or left running — after close.
  const closedRef = useRef(false);
  // True once a stream has actually played. From then on a failure is news the
  // user should see, never a silent jump to the photo sheet.
  const everLiveRef = useRef(false);
  // Latest values for callbacks that outlive a render (the visibility
  // listener, a track's `ended` handler). Reading state directly there would
  // capture a stale mode and flip the review back to the viewfinder.
  const modeRef = useRef<Mode>('opening');
  const facingRef = useRef<Facing>('environment');
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  // A style-only menu must never outlive the screen it belongs to.
  useEffect(() => { setMenuOpen(false); }, [mode]);

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

  // The camera goes dark on the tap (no light left on while the sheet drops
  // away); only the sheet's exit is deferred. The failure screen has no sheet
  // to animate, so it closes at once.
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    stopStream();
    setMenuOpen(false);
    if (reduced || mode === 'blocked') { onClose(); return; }
    setClosing(true);
    closeTimerRef.current = setTimeout(onClose, CLOSE_MS);
  }, [mode, onClose, reduced, stopStream]);

  const pickLibrary = useCallback(() => {
    closedRef.current = true;
    stopStream();
    onPickFromLibrary();
  }, [onPickFromLibrary, stopStream]);

  const startStream = useCallback(async (want: Facing, quiet = false): Promise<void> => {
    const support = cameraEnvironment({
      isSecureContext: window.isSecureContext,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
    });
    if (support !== 'ok') {
      // No camera API, or an http:// page: there is nothing to explain that
      // helps, so fall through to the photo picker without a detour.
      if (isSilentFallback(support, everLiveRef.current)) { pickLibrary(); return; }
      setFailure(support);
      setMode('blocked');
      return;
    }

    stopStream();
    if (!quiet) setMode('opening');
    // A permission prompt nobody answers (a WebView with no delegate, a sheet
    // dismissed by the OS) must not leave a spinner on a black screen.
    const watchdog = setTimeout(() => {
      if (closedRef.current || modeRef.current !== 'opening') return;
      setFailure('unavailable');
      setMode('blocked');
    }, OPEN_TIMEOUT_MS);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(videoConstraints(want));
      clearTimeout(watchdog);
      // Closed, or the watchdog already moved the screen on: release what
      // arrived instead of lighting the camera behind a fallback.
      if (closedRef.current || modeRef.current === 'blocked') {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      everLiveRef.current = true;
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try { await video.play(); } catch { /* autoplay refused: the frame stays blank */ }
      }
      if (closedRef.current) { stopStream(); return; }
      // A photo already on screen keeps it: a quiet re-acquire must never swap
      // the review for the viewfinder.
      if (modeRef.current !== 'review') setMode('live');
      for (const track of stream.getVideoTracks()) {
        track.onended = () => {
          // The device revoked the track (another app took the camera, the
          // phone locked). Ask again; if that fails, the failure state replaces
          // a frozen frame.
          if (closedRef.current || streamRef.current !== stream) return;
          void startStream(facingRef.current, modeRef.current === 'review');
        };
      }
      void syncFlippable();
    } catch (err) {
      clearTimeout(watchdog);
      if (closedRef.current) return;
      const failure = blockerFromError(err);
      // Before the camera ever worked, "no camera / busy" is not a lesson worth
      // a screen — the picker is right there. A refusal always gets the
      // Settings screen, and a camera that played once is news worth showing.
      if (isSilentFallback(failure, everLiveRef.current)) { pickLibrary(); return; }
      setFailure(everLiveRef.current ? 'lost' : failure);
      setMode('blocked');
    }
  }, [pickLibrary, stopStream, syncFlippable]);

  // The loader is mounted from the first frame (already turning when the sheet
  // arrives) and unmounted once its fade to the live picture is done. It only
  // ever covers the sheet's own dark surface, never the dimmed chat.
  const loading = mode === 'opening';
  useEffect(() => {
    if (loading) { setLoaderMounted(true); return; }
    const timer = setTimeout(() => setLoaderMounted(false), reduced ? 0 : LOADER_FADE_MS);
    return () => clearTimeout(timer);
  }, [loading, reduced]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  // No page scroll while the sheet is up; the chat behind stays put.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

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

  // Coming back to the page: hide released the camera, and the OS may have
  // taken the track while it was away. Always ask again — quietly when a photo
  // is already on screen — so the sheet never returns to a dead frame.
  useEffect(() => {
    const onVisibility = () => {
      if (closedRef.current) return;
      if (document.visibilityState === 'hidden') { stopStream(); return; }
      if (modeRef.current === 'blocked') return;
      void startStream(facingRef.current, modeRef.current === 'review');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [startStream, stopStream]);

  const retry = useCallback(() => {
    setFailure('unavailable');
    void startStream(facing);
  }, [facing, startStream]);

  const capture = useCallback(async () => {
    // One photo per intent: a second tap while this frame is still being
    // encoded (toBlob is async) is ignored, not queued.
    if (capturingRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || mode !== 'live') return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      // What the user sees is what gets captured: the video is drawn with
      // object-cover, so the element box is the visible window and the sensor
      // frame is cropped to match it. A box of 0 (mid-layout) falls back to the
      // whole frame rather than producing nothing.
      const box = video.getBoundingClientRect();
      const boxWidth = box.width > 0 ? box.width : video.videoWidth;
      const boxHeight = box.height > 0 ? box.height : video.videoHeight;
      const crop = coverCrop(video.videoWidth, video.videoHeight, boxWidth, boxHeight, MAX_CAPTURE_EDGE);
      if (!crop.dw || !crop.dh) return;

      const canvas = document.createElement('canvas');
      canvas.width = crop.dw;
      canvas.height = crop.dh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);
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
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
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
    if (e.key === 'Escape') {
      e.preventDefault();
      // The open menu is the closer thing to Escape's meaning; the camera is
      // one more Escape away.
      if (menuOpen) { setMenuOpen(false); return; }
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // The container itself holds the opening focus, so Shift+Tab from it is a
    // wrap too, not an escape out of the dialog.
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [close, menuOpen]);

  // Focus starts on the sheet itself — inside the dialog for a keyboard or
  // screen reader user, but not on Close: lighting the back button up as the
  // sheet opens read as a pressed control, and an Enter there would close the
  // camera the user just opened. The next Tab lands on the first control.
  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
  }, []);

  if (typeof document === 'undefined') return null;

  const words = cameraFailureCopy(failure, text.subject);

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
          <h2 className="mt-4 text-headline-mobile">{words.title}</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">{words.body}</p>
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
      aria-label={text.sheet}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      className="fixed inset-0 z-[70] text-inverse-on-surface outline-none"
    >
      {/* Flat scrim over the app. It has no handler on purpose: it swallows
          every tap (nothing behind reacts, the sheet never closes by
          accident) but never does anything itself. */}
      <div aria-hidden className="absolute inset-0 bg-black/50" />

      {/* The sheet: live video edge to edge, 40px shoulders, full bleed through
          the bottom safe area. */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[40px] bg-inverse-surface"
        style={{
          height: SHEET_HEIGHT,
          animation: closing
            ? `onit-sheet-out ${CLOSE_MS}ms ease-out both`
            : `onit-sheet-in ${OPEN_MS}ms ease-out both`,
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover ${mode === 'live' ? '' : 'opacity-0'}`}
        />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL from this capture, not a static asset
          <img src={shot.url} alt={text.photoAlt} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {loaderMounted && (
          <div
            role="status"
            aria-live="polite"
            aria-hidden={loading ? undefined : true}
            className={`pointer-events-none absolute inset-0 grid place-items-center transition-opacity ease-out ${loading ? 'opacity-100' : 'opacity-0'}`}
            style={{ transitionDuration: `${LOADER_FADE_MS}ms` }}
          >
            <OnItSpinner size={32} className="text-primary-fixed" />
            {loading && <span className="sr-only">Starting the camera…</span>}
          </div>
        )}
        {menuOpen && (
          // Tapping the picture is "outside" the menu: it collapses the stack.
          <button
            type="button"
            aria-label="Close camera options"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 z-10 cursor-default"
          />
        )}

        {/* Controls float over the picture, at the sheet's bottom edge. */}
        <div className="absolute inset-x-0 bottom-0 z-20" style={SHEET_INSET}>
          {mode === 'review' ? (
            <div className="flex items-end justify-between gap-3">
              <button
                type="button"
                onClick={retake}
                className={`${PILL} border border-white/40 bg-black/45 text-white`}
              >
                Retake
              </button>
              <button
                type="button"
                onClick={usePhoto}
                className={`${PILL} bg-inverse-on-surface px-7 text-on-background`}
              >
                Use photo
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-3 items-end">
            <button
              ref={closeRef}
              type="button"
              aria-label="Close camera"
              onClick={close}
              className={`justify-self-start ${CIRCLE}`}
            >
              {/* No chevron_left in the font subset: the right chevron turned is one. */}
              <Icon name="chevron_right" size={24} className="rotate-180" />
            </button>

            <button
              type="button"
              aria-label="Take the photo"
              onClick={() => void capture()}
              disabled={mode !== 'live' || capturing}
              className="onit-camera-control grid h-[76px] w-[76px] justify-self-center place-items-center rounded-full border-2 border-white transition active:scale-95 disabled:opacity-40"
            >
              <span className="h-[62px] w-[62px] rounded-full bg-white" />
            </button>

            <div className="relative justify-self-end">
              {menuOpen && (
                <div className="absolute bottom-full right-0 z-20 mb-3 flex flex-col items-center gap-3">
                  <button
                    type="button"
                    aria-label={text.gallery}
                    onClick={pickLibrary}
                    className={CIRCLE}
                  >
                    <Icon name="photo_library" size={22} />
                  </button>
                  {flippable && (
                    <button
                      type="button"
                      aria-label={flipLabel(facing)}
                      onClick={() => { setMenuOpen(false); flip(); }}
                      className={CIRCLE}
                    >
                      <Icon name="autorenew" size={22} />
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                aria-label="More camera options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
                className={CIRCLE}
              >
                <Icon name="more_horiz" size={22} />
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

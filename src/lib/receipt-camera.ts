/* ═══ In-app receipt camera (decisions) ═══
   The screen (components/camera/ReceiptCamera.tsx) owns the stream; every
   decision made before a stream exists lives here, so it can be read and tested
   without a browser: can this context capture at all, what a failed
   getUserMedia means for the user, which camera, and how big a frame to grab.

   The captured File goes into lib/receipt.ts UNCHANGED — prepareReceipt() still
   owns downscale, JPEG encoding, the thumbnail and the content hash, so a photo
   taken here is read, deduped and stored exactly like one from the file input. */

export type Facing = 'environment' | 'user';

/** Why the camera can't be used. */
export type CameraBlocker = 'unsupported' | 'insecure' | 'denied' | 'unavailable';

/** A blocker, plus a stream that died after it was working. */
export type CameraFailure = CameraBlocker | 'lost';

/** Longest edge drawn off the video element. prepareReceipt() downscales to
 *  1600 anyway; this only stops a 4K sensor frame from allocating a huge
 *  canvas on an older phone. */
export const MAX_CAPTURE_EDGE = 2400;

/** JPEG quality of the frame we hand over. prepareReceipt() re-encodes to its
 *  own target size, so this is headroom, not the final quality. */
export const CAPTURE_QUALITY = 0.92;

/** How long the opening spinner may sit before the sheet admits the camera
 *  never answered (a permission prompt nobody sees, a WebView with no
 *  delegate). The screen must never be a black rectangle. */
export const OPEN_TIMEOUT_MS = 12_000;

/**
 * Can this page call getUserMedia at all — before any prompt?
 *
 * 'insecure' is checked first on purpose: on an http:// page the API is often
 * absent too, and "needs https" is the true answer there.
 */
export function cameraEnvironment(env: {
  isSecureContext: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
}): 'ok' | 'unsupported' | 'insecure' {
  if (!env.isSecureContext) return 'insecure';
  if (!env.hasMediaDevices || !env.hasGetUserMedia) return 'unsupported';
  return 'ok';
}

/**
 * What a getUserMedia rejection means for the user.
 *
 * Only NotAllowedError / SecurityError mean "you said no" (the one case where
 * sending them to Settings is useful). Everything else — no camera, camera busy,
 * constraints the device can't satisfy, the gesture timing out — is treated as
 * unavailable, which falls back to the photo picker instead of a Settings
 * lesson that wouldn't help.
 */
export function blockerFromError(err: unknown): CameraBlocker {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  return 'unavailable';
}

export interface CameraFailureCopy {
  title: string;
  body: string;
}

/**
 * Failures that fall straight through to the photo picker with no screen.
 *
 * Only before the camera ever played: "not supported here" and "no camera"
 * have no useful explanation, while a camera that worked once and then failed
 * is news the user should see. A refusal ('denied') is never silent — that is
 * the one case where Settings guidance actually helps.
 */
export function isSilentFallback(failure: CameraFailure, everLive: boolean): boolean {
  if (everLive) return false;
  return failure === 'unsupported' || failure === 'insecure' || failure === 'unavailable';
}

/** The words on the failure screen. Every state has some, so the sheet can
 *  never sit there as a black rectangle. `subject` is what the flow calls the
 *  thing being photographed ("the receipt" by default), so an estimate can say
 *  "pick it from your photos" instead. */
export function cameraFailureCopy(failure: CameraFailure, subject = 'the receipt'): CameraFailureCopy {
  switch (failure) {
    case 'denied':
      return {
        title: 'Camera access is off',
        body: 'On It can’t take the photo until you allow the camera. Open Settings, find On It, and turn Camera on — then come back and try again.',
      };
    case 'insecure':
      return {
        title: 'The camera needs a secure page',
        body: 'Browsers only allow the camera on an https:// page.',
      };
    case 'unsupported':
      return {
        title: 'This browser can’t use the camera',
        body: `You can still pick ${subject} from your photos.`,
      };
    case 'lost':
      return {
        title: 'The camera stopped',
        body: `Another app may have taken it, or the screen locked. Try again, or pick ${subject} from your photos.`,
      };
    case 'unavailable':
      return {
        title: 'No camera available',
        body: `No camera answered, or another app is using it. You can pick ${subject} from your photos instead.`,
      };
  }
}

/** Constraints for the requested camera. `ideal` facing means a device with one
 *  camera still gets a stream instead of an OverconstrainedError. */
export function videoConstraints(facing: Facing): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 2560 },
      height: { ideal: 2560 },
    },
  };
}

export function nextFacing(facing: Facing): Facing {
  return facing === 'environment' ? 'user' : 'environment';
}

/** Only offer the flip control when there is something to flip to. */
export function canFlip(videoInputCount: number): boolean {
  return videoInputCount > 1;
}

/** The flip button's accessible name — it names where the tap takes you. */
export function flipLabel(facing: Facing): string {
  return facing === 'environment' ? 'Switch to the front camera' : 'Switch to the back camera';
}

/**
 * The frame size to draw. A sensor frame larger than maxEdge is scaled down
 * proportionally; anything smaller is kept 1:1 (no upscaling, no stretching).
 */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The part of the sensor frame the user can actually see, plus the size to
 *  draw it at. */
export interface CoverCrop {
  /** Source rectangle inside the video frame, in intrinsic sensor pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Canvas size the rectangle is drawn at (after the maxEdge cap). */
  dw: number;
  dh: number;
}

const EMPTY_CROP: CoverCrop = { sx: 0, sy: 0, sw: 0, sh: 0, dw: 0, dh: 0 };

/**
 * The rectangle to draw so the photo matches what the viewfinder showed.
 *
 * The screen draws the video with `object-cover` inside the bottom sheet, so
 * the frame is scaled until it covers that box and the overflow is hidden —
 * evenly on both sides.
 * Cropping the same rectangle in (sx, sy, sw, sh) means the picture handed to
 * the receipt pipeline is exactly the picture the user framed: no letterbox
 * appears in the photo that wasn't on screen, and nothing visible is cut off.
 *
 * With no box yet (0 × 0, a hidden element) the answer is EMPTY_CROP and the
 * caller must not capture — better no photo than an unasked-for one.
 */
export function coverCrop(
  frameWidth: number,
  frameHeight: number,
  boxWidth: number,
  boxHeight: number,
  maxEdge: number,
): CoverCrop {
  const usable = [frameWidth, frameHeight, boxWidth, boxHeight].every((n) => Number.isFinite(n) && n > 0);
  if (!usable) return EMPTY_CROP;
  const scale = Math.max(boxWidth / frameWidth, boxHeight / frameHeight);
  const sw = Math.min(frameWidth, boxWidth / scale);
  const sh = Math.min(frameHeight, boxHeight / scale);
  const out = fitWithin(sw, sh, maxEdge);
  return {
    sx: (frameWidth - sw) / 2,
    sy: (frameHeight - sh) / 2,
    sw,
    sh,
    dw: out.width,
    dh: out.height,
  };
}

/** A JPEG File name for the capture. The upload path is the content hash, so
 *  this name is only ever seen by prepareReceipt(). */
export function receiptFileName(now: number = Date.now()): string {
  return `receipt-${now}.jpg`;
}

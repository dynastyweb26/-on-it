// ═══ Receipt image pipeline (client-side) ═══
// A phone photo of a receipt is 3–12 MB of 4032×3024 JPEG (or HEIC on iOS).
// Uploading that raw costs the user their data plan and costs us storage and
// vision tokens, so every image is decoded, downscaled and re-encoded here
// BEFORE it leaves the device.
//
// Order matters: the dedup hash is taken from the ORIGINAL bytes, not the
// compressed output. Canvas JPEG encoding is not byte-identical across
// browsers/devices, so hashing the output would make "the same receipt" hash
// differently depending on where it was uploaded from.

/** Longest edge after downscale. Receipt text stays legible to vision at 1600. */
const MAX_EDGE = 1600;
/** Target compressed size. Below this we stop dropping quality. */
const TARGET_BYTES = 900 * 1024;
/** Anything larger than this is not a receipt photo — reject before decoding. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

const QUALITY_STEPS = [0.82, 0.7, 0.6, 0.5];

export interface PreparedReceipt {
  /** Compressed JPEG, ready to upload and to send to the vision route. */
  blob: Blob;
  /** SHA-256 hex of the original file — the dedup key. */
  hash: string;
  /** Object URL for the preview thumbnail. Caller must revokeObjectURL it. */
  previewUrl: string;
  originalBytes: number;
  bytes: number;
}

export class ReceiptError extends Error {}

const isHeic = (file: File) =>
  /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** SHA-256 → lowercase hex. Matches the `^[0-9a-f]{64}$` CHECK on the column. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * iOS shoots HEIC. Safari usually transcodes to JPEG when a photo is picked
 * through a file input, but not always (and never for a HEIC picked on a Mac,
 * or on the Android phones that shoot HEIF). When the browser can't decode it
 * natively we fall back to heic2any — a ~1.5 MB decoder, so it is imported
 * dynamically and only ever downloaded by the users who actually need it.
 */
async function toDecodableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  // Some browsers (Safari on Apple hardware) decode HEIC natively via the OS.
  // Try that first — it's instant and avoids the download entirely.
  if (await canDecode(file)) return file;
  try {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    return Array.isArray(out) ? out[0] : (out as Blob);
  } catch {
    throw new ReceiptError("That photo's in a format I can't read. Try taking it again with the camera.");
  }
}

async function canDecode(blob: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(blob);
    bmp.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode to a bitmap. `imageOrientation: 'from-image'` applies the EXIF
 * rotation — without it, a receipt shot in portrait arrives at the model
 * sideways and the totals get misread.
 */
async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari: fall back to an <img>, which browsers auto-orient.
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new ReceiptError("Couldn't open that image."));
        img.src = url;
      });
    } finally {
      // Safe to revoke once decoded — the bitmap data is already in memory.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Pick → hash → decode (HEIC-aware) → downscale → JPEG.
 * Throws ReceiptError with a message that is safe to show the user verbatim.
 */
export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  if (!file.size) throw new ReceiptError("That file came through empty — try again.");
  if (file.size > MAX_INPUT_BYTES) {
    throw new ReceiptError("That image is too big. Take a photo of the receipt instead of sending a file.");
  }

  // Hash the ORIGINAL bytes — stable across devices, unlike a re-encode.
  const original = await file.arrayBuffer();
  const hash = await sha256Hex(original);

  const decodable = await toDecodableBlob(file);
  const source = await decode(decodable);

  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new ReceiptError("Couldn't read that image — try another photo.");

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ReceiptError("Couldn't process that image on this device.");
  // White underlay: a transparent PNG would otherwise flatten to black and the
  // receipt text would disappear into it.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();

  let blob: Blob | null = null;
  for (const q of QUALITY_STEPS) {
    blob = await canvasToBlob(canvas, q);
    if (blob && blob.size <= TARGET_BYTES) break;
  }
  if (!blob) throw new ReceiptError("Couldn't process that image — try another photo.");

  return {
    blob,
    hash,
    previewUrl: URL.createObjectURL(blob),
    originalBytes: file.size,
    bytes: blob.size,
  };
}

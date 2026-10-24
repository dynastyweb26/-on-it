// Attachment type verification from the stored bytes, never the client's
// Content-Type. JPG / PNG / PDF are accepted; HEIC is detected so the route can
// tell an iOS user to convert (the browser already does with heic2any).
import {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_BYTES,
  type AllowedAttachmentMime,
} from './limits';

export type DetectedAttachmentType =
  | AllowedAttachmentMime
  | 'image/heic'
  | null;

const HEIC_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1',
]);

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0): boolean =>
  bytes.length >= offset + prefix.length &&
  prefix.every((b, i) => bytes[offset + i] === b);

export function detectFileType(bytes: Uint8Array): DetectedAttachmentType {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (bytes.length >= 12) {
    const box = String.fromCharCode(...bytes.subarray(4, 8));
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (box === 'ftyp' && HEIC_BRANDS.has(brand)) return 'image/heic';
  }
  return null;
}

export function extensionFor(mime: AllowedAttachmentMime): 'jpg' | 'png' | 'pdf' {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'pdf';
}

export type AttachmentValidation =
  | { ok: true; mime: AllowedAttachmentMime; ext: 'jpg' | 'png' | 'pdf'; sizeBytes: number }
  | { ok: false; code: 'empty' | 'too_large' | 'heic_not_converted' | 'unsupported_type' };

/** Validate the bytes actually stored. `declared` is only a hint; the bytes win. */
export function validateAttachmentBytes(
  bytes: Uint8Array,
  declared?: string | null,
): AttachmentValidation {
  if (bytes.length === 0) return { ok: false, code: 'empty' };
  if (bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, code: 'too_large' };
  const detected = detectFileType(bytes);
  if (detected === 'image/heic') return { ok: false, code: 'heic_not_converted' };
  if (!detected) return { ok: false, code: 'unsupported_type' };
  // The declared type may be absent; a mismatch is resolved in favour of bytes.
  if (declared && !ALLOWED_ATTACHMENT_MIME.includes(declared as AllowedAttachmentMime)) {
    return { ok: false, code: 'unsupported_type' };
  }
  return { ok: true, mime: detected, ext: extensionFor(detected), sizeBytes: bytes.length };
}

/** Validate a declared type/size before minting an upload URL. */
export function validateDeclaredAttachment(
  mime: string,
  sizeBytes: number,
): { ok: true; mime: AllowedAttachmentMime; ext: 'jpg' | 'png' | 'pdf' } | { ok: false; code: 'unsupported_type' | 'too_large' | 'empty' } {
  if (!ALLOWED_ATTACHMENT_MIME.includes(mime as AllowedAttachmentMime)) {
    return { ok: false, code: 'unsupported_type' };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, code: 'empty' };
  if (sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, code: 'too_large' };
  const allowed = mime as AllowedAttachmentMime;
  return { ok: true, mime: allowed, ext: extensionFor(allowed) };
}

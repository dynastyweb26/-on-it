// Signature validation. A drawn signature is a PNG data URL only (JPEG, SVG,
// WebP and raw base64 are rejected); a typed signature is the signer's name.
// The route validates before the RPC, and sign_estimate re-checks the PNG magic
// and size in SQL so a direct service-role call cannot bypass it.
import {
  MAX_SIGNATURE_DATA_CHARS,
  MAX_SIGNATURE_PNG_BYTES,
  MAX_SIGNER_NAME_CHARS,
  MAX_TYPED_SIGNATURE_CHARS,
} from './limits';
import type { SignatureType } from './types';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;

export type SignatureInputError =
  | 'signer_name'
  | 'signature_type'
  | 'signature_data'
  | 'signature_not_png'
  | 'signature_too_large';

export type NormalizedSignature =
  | {
      ok: true;
      signerName: string;
      type: SignatureType;
      /** PNG data URL for draw, the trimmed name for type. */
      data: string;
    }
  | { ok: false; code: SignatureInputError };

export type PngSignatureResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; code: 'signature_not_png' | 'signature_too_large' };

/** Decode and validate a PNG data URL, distinguishing a wrong type from an
 *  oversized image so the page can tell the signer what to fix. */
export function parsePngSignature(data: string | null | undefined): PngSignatureResult {
  if (!data) return { ok: false, code: 'signature_not_png' };
  const m = PNG_DATA_URL.exec(data.trim());
  if (!m) return { ok: false, code: 'signature_not_png' };
  let bytes: Buffer;
  try {
    bytes = Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
  } catch {
    return { ok: false, code: 'signature_not_png' };
  }
  if (bytes.length > MAX_SIGNATURE_PNG_BYTES) {
    return { ok: false, code: 'signature_too_large' };
  }
  if (bytes.length === 0) return { ok: false, code: 'signature_not_png' };
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return { ok: false, code: 'signature_not_png' };
  }
  return { ok: true, bytes };
}

/** Convenience for callers that only need the bytes. */
export function decodePngSignature(data: string | null | undefined): Buffer | null {
  const parsed = parsePngSignature(data);
  return parsed.ok ? parsed.bytes : null;
}

export function normalizeSignature(input: {
  signerName: string;
  type: SignatureType;
  data?: string;
}): NormalizedSignature {
  const signerName = input.signerName.trim();
  if (!signerName || signerName.length > MAX_SIGNER_NAME_CHARS) {
    return { ok: false, code: 'signer_name' };
  }
  if (input.type !== 'draw' && input.type !== 'type') {
    return { ok: false, code: 'signature_type' };
  }

  if (input.type === 'type') {
    if (signerName.length > MAX_TYPED_SIGNATURE_CHARS) {
      return { ok: false, code: 'signature_data' };
    }
    return { ok: true, signerName, type: 'type', data: signerName };
  }

  const data = input.data?.trim() ?? '';
  if (!data) return { ok: false, code: 'signature_data' };
  if (data.length > MAX_SIGNATURE_DATA_CHARS) {
    return { ok: false, code: 'signature_too_large' };
  }
  const png = parsePngSignature(data);
  if (!png.ok) return { ok: false, code: png.code };
  return { ok: true, signerName, type: 'draw', data };
}

// Request shapes for the estimate routes. The exact consent TEXT is never taken
// from the client — only the version, which must be the current one; the text
// recorded is the server's frozen CONSENT_V1 constant.
import { z } from 'zod';
import { CONSENT_V1, CONSENT_VERSION } from './consent';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_CAPTION_CHARS,
  MAX_SIGNATURE_DATA_CHARS,
  MAX_TITLE_CHARS,
} from './limits';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const SignBodySchema = z.object({
  signer_name: z.string().trim().min(1).max(120),
  signature_type: z.enum(['draw', 'type']),
  signature_data: z.string().max(MAX_SIGNATURE_DATA_CHARS).optional(),
  consent_version: z.literal(CONSENT_VERSION),
  // The exact text the signer saw. It must be the frozen copy — the route still
  // records CONSENT_V1 itself, never the client's string — so a page that drifts
  // from the recorded consent fails loudly instead of signing the wrong words.
  consent_text: z.literal(CONSENT_V1).optional(),
  // Required: the page signs exactly the content it displayed.
  expected_hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export const SendBodySchema = z
  .object({ valid_until: z.string().regex(DATE_ONLY).optional() })
  .nullish();

export const ExtendBodySchema = z.object({
  valid_until: z.string().regex(DATE_ONLY),
});

// Estimate heading. Empty (or whitespace) clears it — the DB stores NULL.
export const TitleBodySchema = z.object({
  title: z.string().max(MAX_TITLE_CHARS).nullable(),
});

// Attachment caption. Empty clears it — the RPC stores NULL.
export const CaptionBodySchema = z.object({
  caption: z.string().max(MAX_CAPTION_CHARS).nullable(),
});

export const PresignBodySchema = z.object({
  mime_type: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  size_bytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  file_name: z.string().max(200).optional(),
});

export const ConfirmBodySchema = z.object({
  path: z.string().min(1).max(400),
});

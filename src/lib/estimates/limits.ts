// Attachment limits for estimates. Enforced in the presign route (declared
// size), the confirm route (actual stored bytes) and the add_estimate_attachment
// RPC (count + total under a row lock).

export const ATTACHMENT_BUCKET = 'invoice-attachments';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const ALLOWED_ATTACHMENT_MIME = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type AllowedAttachmentMime = (typeof ALLOWED_ATTACHMENT_MIME)[number];

export const SIGNED_URL_TTL_SECONDS = 10 * 60;

// Estimate heading and attachment caption. Mirrors the SQL CHECK caps
// (invoices_title_len_chk / invoice_attachments_caption_len_chk).
export const MAX_TITLE_CHARS = 120;
export const MAX_CAPTION_CHARS = 60;

export const MAX_SIGNATURE_PNG_BYTES = 200 * 1024;
export const MAX_TYPED_SIGNATURE_CHARS = 100;
export const MAX_SIGNER_NAME_CHARS = 120;
export const MAX_SIGNATURE_DATA_CHARS = 300_000;

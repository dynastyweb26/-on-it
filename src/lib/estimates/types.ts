// Shared types for the online estimate flow. An estimate is an `invoices` row
// with kind = 'quote'; there is no separate estimates table. These types are
// the contract for sessions 3–5 (public page, sign UI, owner revisit).

export type EstimateState = 'pending' | 'approved' | 'expired' | 'unavailable';

export type SignatureType = 'draw' | 'type';

export type EstimateLineItem = {
  description: string;
  qty: number;
  unitPrice: number;
  unit: string | null;
  detail: string | null;
};

/** The raw shape of a stored line item. `original_description` and anything
 *  else internal is never projected into the public payload. */
export type StoredLineItem = {
  description?: unknown;
  qty?: unknown;
  unit_price?: unknown;
  unit?: unknown;
  detail?: unknown;
};

export type SignatureSummary = {
  signerName: string;
  type: SignatureType;
  /** PNG data URL for `draw`; the typed name for `type`. */
  data: string;
  signedAt: string;
};

export type PublicAttachment = {
  id: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  /** 10-minute signed URL, never a storage path. Null when the object could
   *  not be signed (missing or unreadable): the page shows that row as failed
   *  with an inline retry instead of dropping it. */
  url: string | null;
  /** Owner-written caption, max 60 chars. Null when none. */
  caption: string | null;
};

export type PublicBusiness = {
  name: string | null;
  logoUrl: string | null;
  brandColors: string[];
  backgroundColor: string | null;
  websiteUrl: string | null;
  slogan: string | null;
  /** Read live from profiles.business_phone; null when unset. */
  phone: string | null;
  /** Read live from profiles.business_email; null when unset. */
  email: string | null;
  /** profiles.timezone, so the page can print signed dates in business-local
   *  time (the same clock the expiry rule uses). Null when unset. */
  timezone: string | null;
};

export type PublicEstimate = {
  state: EstimateState;
  /** Raw stored number. Session 1's shared document helper renders E-####. */
  invoiceNumber: number;
  business: PublicBusiness;
  clientName: string;
  /** Estimate heading (invoices.title). Null when the owner left it empty. */
  title: string | null;
  address: string | null;
  lineItems: EstimateLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string | null;
  /** yyyy-mm-dd in the business timezone; null on legacy rows. */
  validUntil: string | null;
  daysRemaining: number | null;
  attachments: PublicAttachment[];
  signature: SignatureSummary | null;
  contentHash: string;
  consent: { text: string; version: string };
};

/** Uniform response for missing, draft, revoked, deleted and converted-unsigned
 *  links. Carries no other field, so a token cannot be probed for existence. */
export type UnavailableEstimate = { state: 'unavailable' };

export type PublicEstimateResult = PublicEstimate | UnavailableEstimate;

export type EstimateRefusalCode =
  | 'validation'
  | 'invalid_signature'
  | 'already_approved'
  | 'content_changed'
  | 'expired'
  | 'unavailable';

export type SignEstimateInput = {
  signerName: string;
  signatureType: SignatureType;
  /** Required for draw (PNG data URL); ignored for type (the name is used). */
  signatureData?: string;
  expectedHash: string;
};

export type SignEstimateResult =
  | { ok: true; signature: SignatureSummary; contentHash: string }
  | { ok: false; code: EstimateRefusalCode; signature?: SignatureSummary };

export type OwnerEstimate = {
  id: string;
  invoiceNumber: number;
  clientName: string;
  status: string;
  approvedAt: string | null;
  validUntil: string | null;
  revokedAt: string | null;
  sentAt: string | null;
  firstSentAt: string | null;
  /** Only returned to the owner, never to the public page. */
  publicToken: string | null;
};

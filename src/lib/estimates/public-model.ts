// The public estimate payload, built from already-loaded rows. Pure and
// testable: no Supabase, no signing, no network. The server loader
// (public.ts) supplies signed attachment URLs and the SQL content hash.
//
// The payload never carries user_id, the storage paths, client phone/email, or
// the invoice status. "unavailable" is the single answer for a missing, draft,
// deleted, revoked or converted-unsigned link, so a token cannot be probed.
import { CONSENT_V1, CONSENT_VERSION } from './consent';
import { estimateState, daysRemaining } from './state';
import type {
  EstimateLineItem,
  PublicAttachment,
  PublicEstimate,
  PublicEstimateResult,
  SignatureSummary,
  StoredLineItem,
} from './types';

export type PublicModelInvoice = {
  id: string;
  invoice_number: number;
  status: string | null;
  deleted_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  valid_until: string | null;
  client_name: string | null;
  client_address: string | null;
  title: string | null;
  line_items: StoredLineItem[] | null;
  subtotal: number | string | null;
  tax_rate: number | string | null;
  tax_amount: number | string | null;
  total: number | string | null;
  notes: string | null;
};

export type PublicModelProfile = {
  business_name: string | null;
  logo_url: string | null;
  brand_colors: string[] | null;
  background_color: string | null;
  website_url: string | null;
  slogan: string | null;
  /** Live read — never snapshotted on the invoice. */
  business_phone: string | null;
  /** Live read — never snapshotted on the invoice. */
  business_email: string | null;
  timezone: string | null;
};

export type PublicModelInput = {
  invoice: PublicModelInvoice;
  profile: PublicModelProfile;
  attachments: PublicAttachment[];
  signature: SignatureSummary | null;
  /** A non-deleted invoice exists with converted_from = invoice.id. */
  converted: boolean;
  contentHash: string;
  now: Date;
  /** Owner preview: a draft renders as pending (the sign RPC still refuses it). */
  preview?: boolean;
};

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const text = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};

export function toEstimateLineItem(li: StoredLineItem): EstimateLineItem {
  return {
    description: String(li.description ?? ''),
    qty: num(li.qty),
    unitPrice: num(li.unit_price),
    unit: typeof li.unit === 'string' && li.unit.trim() ? li.unit.trim() : null,
    detail:
      typeof li.detail === 'string' && li.detail.trim() ? li.detail.trim() : null,
  };
}

export function toPublicEstimate(input: PublicModelInput): PublicEstimateResult {
  const { invoice, profile, attachments, signature, converted, contentHash, now } = input;
  const facts = {
    status: invoice.status,
    deletedAt: invoice.deleted_at,
    approvedAt: invoice.approved_at,
    revokedAt: invoice.revoked_at,
    validUntil: invoice.valid_until,
    converted,
  };

  let state = estimateState(facts, now, profile.timezone);
  if (state === 'unavailable') {
    if (!input.preview) return { state: 'unavailable' };
    // A draft is previewable by its owner, and only its owner.
    if (invoice.deleted_at || invoice.revoked_at || converted) {
      return { state: 'unavailable' };
    }
    state = 'pending';
  }

  return {
    state,
    invoiceNumber: invoice.invoice_number,
    business: {
      name: text(profile.business_name),
      logoUrl: text(profile.logo_url),
      brandColors: (profile.brand_colors ?? []).filter(
        (c): c is string => typeof c === 'string' && c.trim().length > 0,
      ),
      backgroundColor: text(profile.background_color),
      websiteUrl: text(profile.website_url),
      slogan: text(profile.slogan),
      // Read live from the profile on every request (not the invoice snapshot),
      // so a changed number reaches the client.
      phone: text(profile.business_phone),
      email: text(profile.business_email),
    },
    clientName: text(invoice.client_name) ?? '',
    title: text(invoice.title),
    address: text(invoice.client_address),
    lineItems: (invoice.line_items ?? []).map(toEstimateLineItem),
    subtotal: num(invoice.subtotal),
    taxRate: num(invoice.tax_rate),
    taxAmount: num(invoice.tax_amount),
    total: num(invoice.total),
    notes: text(invoice.notes),
    validUntil: invoice.valid_until,
    daysRemaining:
      state === 'approved'
        ? null
        : daysRemaining(
            { ...facts, status: 'sent', approvedAt: null, converted: false },
            now,
            profile.timezone,
          ),
    attachments,
    signature,
    contentHash,
    consent: { text: CONSENT_V1, version: CONSENT_VERSION },
  };
}

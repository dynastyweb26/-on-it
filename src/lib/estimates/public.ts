// Server loader for the public estimate page (and the owner's preview).
//
// The ONLY data path is the service-role client. Every field is projected here;
// user_id and storage paths never leave this module. Attachments are filtered by
// the shared deliverable rule (checksum + own folder) BEFORE a signed URL is
// minted, so a forged row cannot publish someone else's object.
import 'server-only';
import { adminClient } from '@/lib/supabase/admin';
import { deliverableAttachments } from './deliverable';
import { ATTACHMENT_BUCKET, SIGNED_URL_TTL_SECONDS } from './limits';
import { toPublicEstimate, type PublicModelInvoice, type PublicModelProfile } from './public-model';
import type {
  PublicAttachment,
  PublicEstimateResult,
  SignatureSummary,
  SignatureType,
} from './types';

const BUCKET = ATTACHMENT_BUCKET;
const TOKEN_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function isEstimateTokenShape(token: string): boolean {
  return TOKEN_RE.test(token);
}

type InvoiceRow = PublicModelInvoice & {
  user_id: string;
  kind: string | null;
  public_token: string | null;
};

type ProfileRow = PublicModelProfile & { id: string };

type AttachmentRow = {
  id: string;
  storage_path: string;
  position: number;
  mime_type: string | null;
  size_bytes: number | null;
  checksum: string | null;
  caption: string | null;
};

type SignatureRow = {
  signer_name: string;
  signature_type: SignatureType;
  signature_data: string;
  signed_at: string;
};

const INVOICE_COLS =
  'id, user_id, kind, public_token, invoice_number, status, deleted_at, approved_at, ' +
  'revoked_at, valid_until, client_name, client_address, title, line_items, subtotal, tax_rate, ' +
  'tax_amount, total, notes';

const PROFILE_COLS =
  'id, business_name, logo_url, brand_colors, background_color, website_url, slogan, ' +
  'business_phone, business_email, timezone';

function signatureSummary(row: SignatureRow | null): SignatureSummary | null {
  if (!row) return null;
  return {
    signerName: row.signer_name,
    type: row.signature_type,
    data: row.signature_data,
    signedAt: row.signed_at,
  };
}

export async function loadPublicEstimate(token: string): Promise<PublicEstimateResult> {
  if (!isEstimateTokenShape(token)) return { state: 'unavailable' };

  const admin = adminClient();
  const { data, error } = await admin
    .from('invoices')
    .select(INVOICE_COLS)
    .eq('public_token', token)
    .maybeSingle();
  if (error) throw error;
  const invoice = data as InvoiceRow | null;
  if (!invoice || invoice.kind !== 'quote') return { state: 'unavailable' };

  return shape(admin, invoice, false);
}

/** The owner's view of the same payload, including a draft. Returns null when
 *  the id is not the caller's own quote (no existence leak). */
export async function loadOwnerEstimatePreview(
  invoiceId: string,
  userId: string,
): Promise<PublicEstimateResult | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('invoices')
    .select(INVOICE_COLS)
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const invoice = data as InvoiceRow | null;
  if (!invoice || invoice.kind !== 'quote') return null;

  return shape(admin, invoice, true);
}

export type OwnerPreview = { id: string; result: PublicEstimateResult };

/** The owner's preview reached through the public link (?preview=1). Shaping is
 *  the same code path as GET /api/estimates/[id]/preview, so the two cannot
 *  drift; only the caller's own row is ever returned, and a draft is previewable
 *  by its owner. */
export async function loadOwnerEstimatePreviewByToken(
  token: string,
  userId: string,
): Promise<OwnerPreview | null> {
  if (!isEstimateTokenShape(token)) return null;

  const admin = adminClient();
  const { data, error } = await admin
    .from('invoices')
    .select(INVOICE_COLS)
    .eq('public_token', token)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const invoice = data as InvoiceRow | null;
  if (!invoice || invoice.kind !== 'quote') return null;

  return { id: invoice.id, result: await shape(admin, invoice, true) };
}

async function shape(
  admin: ReturnType<typeof adminClient>,
  invoice: InvoiceRow,
  preview: boolean,
): Promise<PublicEstimateResult> {
  const [profileRes, attachmentsRes, signatureRes, convertedRes, hashRes] = await Promise.all([
    admin.from('profiles').select(PROFILE_COLS).eq('id', invoice.user_id).maybeSingle(),
    admin
      .from('invoice_attachments')
      .select('id, storage_path, position, mime_type, size_bytes, checksum, caption')
      .eq('invoice_id', invoice.id)
      .order('position'),
    admin
      .from('estimate_signatures')
      .select('signer_name, signature_type, signature_data, signed_at')
      .eq('estimate_id', invoice.id)
      .maybeSingle(),
    admin
      .from('invoices')
      .select('id')
      .eq('converted_from', invoice.id)
      .is('deleted_at', null)
      .limit(1),
    admin.rpc('estimate_content_hash', { p_invoice_id: invoice.id }),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (attachmentsRes.error) throw attachmentsRes.error;
  if (signatureRes.error) throw signatureRes.error;
  if (convertedRes.error) throw convertedRes.error;
  if (hashRes.error) throw hashRes.error;

  const profile = profileRes.data as ProfileRow | null;
  if (!profile) return { state: 'unavailable' };

  const deliverable = deliverableAttachments(
    (attachmentsRes.data ?? []) as AttachmentRow[],
    invoice.user_id,
    invoice.id,
  );

  const signed = await Promise.all(
    deliverable.map(async (row): Promise<PublicAttachment | null> => {
      const mime = row.mime_type;
      if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'application/pdf') {
        return null;
      }
      const { data: urlData, error: urlError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
      if (urlError || !urlData?.signedUrl) {
        // Never log the path: it carries the owner's id.
        console.error('estimate attachment: sign url failed', row.id, urlError?.message ?? 'no url');
        return null;
      }
      const caption = (row.caption ?? '').trim();
      return {
        id: row.id,
        mimeType: mime,
        sizeBytes: row.size_bytes ?? 0,
        url: urlData.signedUrl,
        caption: caption.length ? caption : null,
      };
    }),
  );

  const contentHash = hashRes.data as string | null;
  if (!contentHash) return { state: 'unavailable' };

  return toPublicEstimate({
    invoice,
    profile,
    attachments: signed.filter((a): a is PublicAttachment => a !== null),
    signature: signatureSummary(signatureRes.data as SignatureRow | null),
    converted: (convertedRes.data ?? []).length > 0,
    contentHash,
    now: new Date(),
    preview,
  });
}

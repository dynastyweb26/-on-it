// POST /api/public/estimates/[token]/sign — the client signs an estimate.
//
// The token is the authorization. The whole transaction (validate state, lock
// the row, recompute the content hash, write the signature + approved_at + the
// notification claim) is public.sign_estimate; this route only validates input,
// calls it, maps its codes to HTTP, and sends the already-claimed push.
//
// Typed refusals so the page can react:
//   400 { code: 'validation' | 'invalid_signature' }
//   409 { code: 'already_approved', signature } | { code: 'content_changed' }
//   410 { code: 'expired' | 'unavailable' }
//   429 rate limited
import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase/admin';
import { CONSENT_VERSION, CONSENT_V1 } from '@/lib/estimates/consent';
import { normalizeSignature } from '@/lib/estimates/signature';
import { isEstimateTokenShape } from '@/lib/estimates/public';
import { SignBodySchema } from '@/lib/estimates/schemas';
import { notifyClaimed } from '@/lib/notify';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import type { SignatureSummary, SignatureType } from '@/lib/estimates/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RpcSignature = {
  signer_name: string;
  signature_type: SignatureType;
  signature_data: string;
  signed_at: string;
};

type RpcResult =
  | {
      ok: true;
      signature: RpcSignature;
      content_hash: string;
      notification_log_id: string | null;
      estimate_id: string;
      user_id: string;
      invoice_number: number;
      client_name: string | null;
      total: number | string | null;
    }
  | { ok: false; code: string; signature?: RpcSignature | null };

const summary = (s: RpcSignature | null | undefined): SignatureSummary | null =>
  s
    ? {
        signerName: s.signer_name,
        type: s.signature_type,
        data: s.signature_data,
        signedAt: s.signed_at,
      }
    : null;

const refuse = (status: number, code: string, signature?: SignatureSummary | null) =>
  NextResponse.json(signature ? { code, signature } : { code }, { status });

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  if (!(await rateLimit('estimate_sign', `ip:${clientIp(req)}`))) {
    return NextResponse.json(
      { code: 'rate_limited', message: 'Too many attempts. Wait a moment and try again.' },
      { status: 429 },
    );
  }

  const token = params.token;
  if (!isEstimateTokenShape(token)) return refuse(410, 'unavailable');

  const body = SignBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return refuse(400, 'validation');

  // The consent text recorded is the server's frozen copy, never the client's.
  const normalized = normalizeSignature({
    signerName: body.data.signer_name,
    type: body.data.signature_type,
    data: body.data.signature_data,
  });
  if (!normalized.ok) {
    return refuse(
      400,
      normalized.code === 'signer_name' ||
        normalized.code === 'signature_type' ||
        normalized.code === 'signature_data'
        ? 'validation'
        : 'invalid_signature',
    );
  }

  const { data, error } = await adminClient().rpc('sign_estimate', {
    p_token: token,
    p_signer_name: normalized.signerName,
    p_signature_type: normalized.type,
    p_signature_data: normalized.data,
    p_consent_text: CONSENT_V1,
    p_consent_version: CONSENT_VERSION,
    p_expected_hash: body.data.expected_hash,
    p_ip: clientIp(req),
    p_user_agent: req.headers.get('user-agent') ?? null,
  });

  if (error) {
    console.error('sign_estimate: rpc failed', error.code ?? error.message);
    return NextResponse.json(
      { code: 'unavailable', message: 'We couldn’t sign this estimate. Please try again.' },
      { status: 500 },
    );
  }

  const result = data as RpcResult | null;
  if (!result) return refuse(410, 'unavailable');

  if (result.ok) {
    const sig = summary(result.signature);
    if (!sig) return refuse(410, 'unavailable');

    // sign_estimate already claimed the notification row atomically with the
    // signature; this only delivers it (a second claim would dedupe to nothing).
    if (result.notification_log_id) {
      await notifyClaimed(result.user_id, result.notification_log_id, {
        type: 'estimate_approved',
        estimateId: result.estimate_id,
        invoiceNumber: result.invoice_number,
        clientName: (result.client_name ?? '').trim() || 'Your client',
        total: Number(result.total ?? 0),
        signerName: sig.signerName,
      });
    }

    return NextResponse.json(
      { ok: true, signature: sig, contentHash: result.content_hash },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  switch (result.code) {
    case 'already_approved':
      return refuse(409, 'already_approved', summary(result.signature));
    case 'content_changed':
      return refuse(409, 'content_changed');
    case 'expired':
      return refuse(410, 'expired');
    case 'validation':
      return refuse(400, 'validation');
    case 'invalid_signature':
      return refuse(400, 'invalid_signature');
    case 'unavailable':
    default:
      return refuse(410, 'unavailable');
  }
}

'use client';
// Owner estimate actions: the one place the screen talks to the estimate
// routes. Kept out of the component so the request/response contract and the
// user-facing error copy can be tested without a DOM.
//
// Estimates never use /api/invoices/[id]/send: sending and resending both go
// to /api/estimates/[id]/send, and the client preview goes to /preview.
import type { PublicEstimate } from './types';
import { ESTIMATE_OFFLINE_TEXT } from '@/lib/popups/status';
import { REVOKE_CONFLICT } from '@/lib/popups/destructive';

export type EstimateSendOutcome =
  | { ok: true; estimate: Record<string, unknown>; firstSend: boolean }
  | { ok: false; message: string };

export type EstimatePreviewOutcome =
  | { ok: true; preview: PublicEstimate }
  | { ok: false; message: string };

export type EstimateLinkShare = 'shared' | 'copied' | 'cancelled' | 'failed';

export type EstimateEditsOutcome =
  | { ok: true; estimate: Record<string, unknown> }
  | { ok: false; message: string };

export type EstimateExtendOutcome =
  | { ok: true; validUntil: string }
  | { ok: false; message: string };

export type EstimateRevokeOutcome =
  | { ok: true; revokedAt: string }
  /** conflict: a 409 — the estimate is signed or converted (board D7). */
  | { ok: false; message: string; conflict?: boolean };

export function sendErrorMessage(status: number, code?: string | null): string {
  if (status === 401) return 'Please sign in again.';
  if (status === 404) return "This estimate couldn't be found.";
  if (status === 429) return 'Too many attempts. Try again in a minute.';
  if (status === 400) return "Pick a date that isn't in the past.";
  if (status === 409) {
    if (code === 'approved') return 'This estimate is already approved.';
    if (code === 'converted') return 'This estimate has already been converted.';
    if (code === 'void') return 'This estimate can no longer be sent.';
  }
  // Accurate on purpose: a failed first send may have written a draft row, so
  // the copy promises only what is true — the client received nothing.
  return "Couldn't create the link. Nothing was shared.";
}

/** `validUntil` (YYYY-MM-DD) is optional; without it the server keeps the row's
 *  date or sets local today + 30. A past date is refused (400). */
export async function requestEstimateSend(id: string, validUntil?: string | null): Promise<EstimateSendOutcome> {
  try {
    const res = await fetch(`/api/estimates/${id}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validUntil ? { valid_until: validUntil } : {}),
    });
    const body = (await res.json().catch(() => null)) as
      | { estimate?: Record<string, unknown>; firstSend?: boolean; error?: string }
      | null;
    if (!res.ok || !body?.estimate) {
      return { ok: false, message: sendErrorMessage(res.status, body?.error) };
    }
    return { ok: true, estimate: body.estimate, firstSend: body.firstSend === true };
  } catch {
    // No connection is its own story (S3); anything else keeps the link sentence.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return { ok: false, message: offline ? ESTIMATE_OFFLINE_TEXT : "Couldn't create the link. Nothing was shared." };
  }
}

export async function requestEstimatePreview(id: string): Promise<EstimatePreviewOutcome> {
  try {
    const res = await fetch(`/api/estimates/${id}/preview`, { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as
      | (PublicEstimate & { state?: string; error?: string })
      | null;
    if (!res.ok || !body || body.state === 'unavailable') {
      return { ok: false, message: "The client preview isn't available right now." };
    }
    return { ok: true, preview: body as PublicEstimate };
  } catch {
    return { ok: false, message: "The client preview isn't available right now." };
  }
}

export async function requestEstimateExtend(
  id: string,
  validUntil: string,
): Promise<EstimateExtendOutcome> {
  try {
    const res = await fetch(`/api/estimates/${id}/extend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ valid_until: validUntil }),
    });
    const body = (await res.json().catch(() => null)) as
      | { estimate?: { valid_until?: string }; error?: string }
      | null;
    if (!res.ok || !body?.estimate?.valid_until) {
      return {
        ok: false,
        message: res.status === 409
          ? 'This estimate can no longer be extended.'
          : "Couldn't extend the validity. Please try again.",
      };
    }
    return { ok: true, validUntil: body.estimate.valid_until };
  } catch {
    return { ok: false, message: "Couldn't extend the validity. Please try again." };
  }
}

export async function requestEstimateRevoke(id: string): Promise<EstimateRevokeOutcome> {
  try {
    const res = await fetch(`/api/estimates/${id}/revoke`, { method: 'POST' });
    const body = (await res.json().catch(() => null)) as
      | { estimate?: { revoked_at?: string }; error?: string }
      | null;
    if (!res.ok || !body?.estimate?.revoked_at) {
      const conflict = res.status === 409;
      return {
        ok: false,
        // A 409 is the document's state, not a fault: the sheet shows this
        // sentence as the cause instead of "something broke on our end".
        message: conflict
          ? REVOKE_CONFLICT.cause
          : "Couldn't deactivate the link. Please try again.",
        conflict,
      };
    }
    return { ok: true, revokedAt: body.estimate.revoked_at };
  } catch {
    return { ok: false, message: "Couldn't deactivate the link. Please try again." };
  }
}

/** Save title + line items in ONE update. The version trigger runs once per
 *  statement, so a batched save bumps the estimate version exactly once. */
export async function requestEstimateEdits(
  id: string,
  edits: { title?: string | null; lineItems?: unknown[] },
): Promise<EstimateEditsOutcome> {
  const body: Record<string, unknown> = {};
  if (edits.title !== undefined) body.title = edits.title;
  if (edits.lineItems !== undefined) body.line_items = edits.lineItems;
  try {
    const res = await fetch(`/api/estimates/${id}/edits`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { estimate?: Record<string, unknown> } | null;
    if (!res.ok || !json?.estimate) {
      return {
        ok: false,
        message: res.status === 409
          ? 'This estimate is signed and locked.'
          : res.status === 401
            ? 'Please sign in again.'
            : "Couldn't save those changes. Please try again.",
      };
    }
    return { ok: true, estimate: json.estimate };
  } catch {
    return { ok: false, message: "Couldn't save those changes. Please try again." };
  }
}

/** The client-facing link. Null without a token (never mint one here). */
export function estimateLink(token: string | null | undefined): string | null {
  if (!token || typeof window === 'undefined') return null;
  return `${window.location.origin}/e/${token}`;
}

export function estimateShareText(businessName: string | null | undefined): string {
  return `Estimate from ${businessName?.trim() || 'On It'}`;
}

/**
 * Native share sheet when the platform has one, clipboard otherwise. A user
 * cancel is silent (not an error); a blocked clipboard is the only failure.
 */
export async function shareEstimateLink(input: {
  url: string;
  title: string;
  text: string;
}): Promise<EstimateLinkShare> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(input);
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
      // Some desktop browsers expose share but reject it; fall through.
    }
  }
  try {
    await navigator.clipboard.writeText(input.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

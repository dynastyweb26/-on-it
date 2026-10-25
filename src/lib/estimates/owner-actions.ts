'use client';
// Owner estimate actions: the one place the screen talks to the estimate
// routes. Kept out of the component so the request/response contract and the
// user-facing error copy can be tested without a DOM.
//
// Estimates never use /api/invoices/[id]/send: sending and resending both go
// to /api/estimates/[id]/send, and the client preview goes to /preview.
import type { PublicEstimate } from './types';

export type EstimateSendOutcome =
  | { ok: true; estimate: Record<string, unknown>; firstSend: boolean }
  | { ok: false; message: string };

export type EstimatePreviewOutcome =
  | { ok: true; preview: PublicEstimate }
  | { ok: false; message: string };

export type EstimateLinkShare = 'shared' | 'copied' | 'cancelled' | 'failed';

export type EstimateDuplicateOutcome =
  | { ok: true; id: string }
  | { ok: false; paywall: boolean; message: string };

export type EstimateExtendOutcome =
  | { ok: true; validUntil: string }
  | { ok: false; message: string };

export type EstimateRevokeOutcome =
  | { ok: true; revokedAt: string }
  | { ok: false; message: string };

export type EstimateTitleOutcome =
  | { ok: true; title: string | null }
  | { ok: false; message: string };

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
  return "Couldn't send the estimate. Please try again.";
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
    return { ok: false, message: "Couldn't send the estimate. Please try again." };
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
      return {
        ok: false,
        message: res.status === 409
          ? 'This estimate can no longer be deactivated.'
          : "Couldn't deactivate the link. Please try again.",
      };
    }
    return { ok: true, revokedAt: body.estimate.revoked_at };
  } catch {
    return { ok: false, message: "Couldn't deactivate the link. Please try again." };
  }
}

export async function requestEstimateTitle(
  id: string,
  title: string | null,
): Promise<EstimateTitleOutcome> {
  try {
    const res = await fetch(`/api/estimates/${id}/title`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const body = (await res.json().catch(() => null)) as
      | { estimate?: { title?: string | null }; error?: string }
      | null;
    if (!res.ok || !body?.estimate) {
      return {
        ok: false,
        message: res.status === 409
          ? 'This estimate is locked.'
          : "Couldn't save the title. Please try again.",
      };
    }
    return { ok: true, title: body.estimate.title ?? null };
  } catch {
    return { ok: false, message: "Couldn't save the title. Please try again." };
  }
}

export async function requestEstimateDuplicate(id: string): Promise<EstimateDuplicateOutcome> {
  try {
    const res = await fetch(`/api/estimates/${id}/duplicate`, { method: 'POST' });
    const body = (await res.json().catch(() => null)) as
      | { estimate?: { id?: string }; error?: string }
      | null;
    if (res.status === 402 || body?.error === 'paywall') {
      return { ok: false, paywall: true, message: 'You have reached the free invoice limit.' };
    }
    if (!res.ok || !body?.estimate?.id) {
      return {
        ok: false,
        paywall: false,
        message: res.status === 409
          ? 'Only an approved estimate can be duplicated.'
          : "Couldn't duplicate this estimate. Please try again.",
      };
    }
    return { ok: true, id: body.estimate.id };
  } catch {
    return { ok: false, paywall: false, message: "Couldn't duplicate this estimate. Please try again." };
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

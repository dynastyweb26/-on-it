// The public estimate page's decision table: colors, copy, dates, labels and
// the sign-sheet error map. Pure — no React, no fetch — so every branch is
// unit-tested (model.test.ts) instead of clicked through.
//
// Colors: brand tokens come from src/lib/colors.ts ONLY (contrastRatio /
// buildTheme / explicitColorRoles). There is no second contrast function here;
// accentText reuses contrastRatio and applies the design's darkening rule.
import {
  adjustAccentForContrast,
  buildTheme,
  explicitColorRoles,
  onColor,
} from '@/lib/colors';
import { CONSENT_V1 } from '@/lib/estimates/consent';
import type {
  EstimateLineItem,
  EstimateState,
  PublicAttachment,
  PublicEstimate,
  SignatureSummary,
} from '@/lib/estimates/types';
import { calculateLineAmount, money } from '@/lib/financials';
import { normalizeLineDetail, normalizeLineUnit, unitLabel } from '@/lib/line-units';
import type { EstIconName } from './estimate-icon-names';

// ── Design tokens (ESTIMATES-DESIGN-SPEC §1) ────────────────────────────────
export const PAGE_BG = '#FDF8F0';
export const INK = '#1E1A15';
export const GOLD = '#D3AE37';
export const DEFAULT_TZ = 'America/Chicago';

const HEX = /^#[0-9a-f]{6}$/i;
const isHex = (c: unknown): c is string => typeof c === 'string' && HEX.test(c);

// ── Brand color ────────────────────────────────────────────────────────────

/** The public accent: the business's chosen brand color, else the gold
 *  fallback. Role ordering and scoring stay in colors.ts (no second palette). */
export function brandAccent(
  brandColors: readonly string[] | null | undefined,
  backgroundColor: string | null | undefined,
): string {
  const colors = (brandColors ?? []).filter(isHex);
  if (!colors.length) return GOLD;
  // Spec §1: no background set → score the picks against paper, as the app does.
  const background = isHex(backgroundColor) ? backgroundColor : '#FFFFFF';
  return buildTheme(colors, background, explicitColorRoles(colors, background)).accent;
}

/** accent made readable as text on the page paper. */
export function accentText(accent: string): string {
  return adjustAccentForContrast(isHex(accent) ? accent : GOLD, PAGE_BG);
}

/** Text on top of the accent fill. */
export function onAccentColor(accent: string): string {
  return onColor(isHex(accent) ? accent : GOLD);
}

export type EstimateTheme = {
  accent: string;
  /** Accent safe as TEXT on the page paper. */
  accentInk: string;
  /** Text that sits on an accent fill. */
  onAccent: string;
};

export function estimateTheme(payload: PublicEstimate): EstimateTheme {
  const accent = brandAccent(payload.business.brandColors, payload.business.backgroundColor);
  return { accent, accentInk: accentText(accent), onAccent: onAccentColor(accent) };
}

/** Initials tile when the business has no logo (spec §1). */
export function initials(businessName: string | null): string {
  const words = (businessName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'OI';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

// ── Document number ────────────────────────────────────────────────────────

/** Estimates print as E-#### (the stored Q-#### digits, never "Q-"). */
export function estimateNumber(n: number): string {
  return `E-${String(Number.isFinite(n) ? n : 0).padStart(4, '0')}`;
}

// ── Money and labels ───────────────────────────────────────────────────────

export function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

/** "8.25" → "8.25%", "8" → "8%". */
export function taxRateLabel(rate: number): string {
  const n = Number.isFinite(rate) ? rate : 0;
  return `${parseFloat(n.toFixed(3))}%`;
}

/** "3 hr × $85.00" — the quantity line under an item's name. */
export function lineMeta(item: EstimateLineItem): string {
  const qty = Number.isFinite(item.qty) ? item.qty : 0;
  const qtyText = Number.isInteger(qty) ? String(qty) : String(parseFloat(qty.toFixed(2)));
  return `${qtyText} ${unitLabel(normalizeLineUnit(item.unit))} × ${money(item.unitPrice)}`;
}

export function lineAmount(item: EstimateLineItem): number {
  return calculateLineAmount(item.qty, item.unitPrice);
}

export function lineDetail(item: EstimateLineItem): string | null {
  return normalizeLineDetail(item.detail);
}

/** "340 KB" / "1.2 MB". */
export function fileSize(bytes: number): string {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (n >= 1024 * 1024) {
    const mb = n / (1024 * 1024);
    return `${parseFloat(mb.toFixed(1))} MB`;
  }
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}

export function isPhoto(attachment: PublicAttachment): boolean {
  return attachment.mimeType === 'image/jpeg' || attachment.mimeType === 'image/png';
}

/** The line under the estimate title: "{title} · {address}", missing parts and
 *  a dangling dot omitted (spec §2.1). */
export function jobLine(payload: PublicEstimate): string {
  return [payload.title, payload.address].filter((p): p is string => !!p && p.trim().length > 0).join(' · ');
}

/** "{N items} · includes {tax} tax" under the total. */
export function totalSubline(payload: PublicEstimate): string {
  const items = itemsLabel(payload.lineItems.length);
  return payload.taxAmount > 0 ? `${items} · includes ${money(payload.taxAmount)} tax` : items;
}

// ── Contact row ────────────────────────────────────────────────────────────

export function telHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned || phone}`;
}

export function smsHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `sms:${cleaned || phone}`;
}

// ── Dates ──────────────────────────────────────────────────────────────────

function resolveTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** "Nov 18" — date-only values read in UTC so they never shift a day. */
export function shortDate(value: string | null | undefined, tz?: string | null): string {
  if (!value) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: dateOnly ? 'UTC' : resolveTz(tz),
  }).format(date);
}

/** "Oct 22, 2026 at 10:42 PM" in the business timezone. */
export function longDateTime(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const text = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: resolveTz(tz),
  }).format(date);
  return text.replace(/, (\d{1,2}:\d{2}\s?[AP]M)$/, ' at $1');
}

/** Hero-card right side: "Valid until Nov 18" / "Approved Oct 22" /
 *  "Expired Nov 18". Empty when there is nothing to promise. */
export function validityText(payload: PublicEstimate): string {
  const tz = payload.business.timezone;
  if (payload.state === 'approved') {
    return payload.signature ? `Approved ${shortDate(payload.signature.signedAt, tz)}` : '';
  }
  if (payload.state === 'expired') {
    return payload.validUntil ? `Expired ${shortDate(payload.validUntil)}` : 'Expired';
  }
  if (payload.state === 'pending' && payload.validUntil) {
    return `Valid until ${shortDate(payload.validUntil)}`;
  }
  return '';
}

export function signedDateText(payload: PublicEstimate): string {
  if (!payload.signature) return '';
  return longDateTime(payload.signature.signedAt, payload.business.timezone);
}

/** "E-0017 · $1,234.56" — the sign sheet subtitle. */
export function sheetSubtitle(payload: PublicEstimate): string {
  return `${estimateNumber(payload.invoiceNumber)} · ${money(payload.total)}`;
}

// ── Status chip ────────────────────────────────────────────────────────────

export type StatusChip = { label: string; icon: EstIconName; tone: 'pending' | 'approved' | 'expired' };

export function statusChip(state: EstimateState): StatusChip | null {
  switch (state) {
    case 'pending':
      return { label: 'Pending', icon: 'schedule', tone: 'pending' };
    case 'approved':
      return { label: 'Approved', icon: 'verified', tone: 'approved' };
    case 'expired':
      return { label: 'Expired', icon: 'event_busy', tone: 'expired' };
    default:
      return null;
  }
}

// ── Consent and sign sheet ─────────────────────────────────────────────────

/** Split of the frozen CONSENT_V1 so the screen shows exactly what is recorded.
 *  model.test.ts asserts `${label} ${helper}` === CONSENT_V1. */
export const CONSENT_LABEL = 'I agree to this estimate and to sign electronically.';
export const CONSENT_HELPER = 'By approving, you agree to sign this estimate electronically.';

export const CONSENT_SPLIT_OK = `${CONSENT_LABEL} ${CONSENT_HELPER}` === CONSENT_V1;

export type SignDraft = {
  hasInk: boolean;
  name: string;
  agreed: boolean;
};

/** The disabled-reason sentence: only what is still missing, in screen order. */
export function stillNeeded(draft: SignDraft): string[] {
  const missing: string[] = [];
  if (!draft.hasInk) missing.push('signature');
  if (draft.name.trim().length < 2) missing.push('full name');
  if (!draft.agreed) missing.push('checkbox');
  return missing;
}

export function stillNeededText(draft: SignDraft): string | null {
  const missing = stillNeeded(draft);
  return missing.length ? `Still needed: ${missing.join(', ')}` : null;
}

export function typedSignature(signature: SignatureSummary | null): string | null {
  return signature && signature.type === 'type' ? signature.data : null;
}

export function drawnSignature(signature: SignatureSummary | null): string | null {
  return signature && signature.type === 'draw' ? signature.data : null;
}

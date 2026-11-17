// ═══ ON IT — what the lock sheet and the photos notice say (design/tiers 04, 05) ═══
// Pure wording and decisions for the two Part 2 pieces of PR B. No price, plan
// name or limit is written here: prices and names come from the plan catalog
// (/api/access planCatalog), the lock from lib/plan-lock, and the skipped
// photos from what convert stored (attachments_skipped / _from).
import type { TierPlan } from './entitlements';
import type { PlanCatalog, PlanOffer } from './plan-catalog';
import type { PlanFeature, PlanLock } from './plan-lock';

/** "$16.99" from whole cents. Formatting only: the price is the catalog's. */
export function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function offerOf(catalog: PlanCatalog | null | undefined, plan: TierPlan): PlanOffer | null {
  return catalog?.plans?.find((p) => p.plan === plan) ?? null;
}

// ── 04 Lock sheet ───────────────────────────────────────────────────────────

/** The document a photo lock was opened from: the headline names it. */
export type LockDoc = 'invoice' | 'estimate';

export interface LockSheetCopy {
  icon: 'account_balance' | 'event_repeat' | 'add_photo_alternate';
  title: string;
  body: string;
}

/** Board 04: what is locked, what it does, and what the user keeps. */
export function lockSheetCopy(feature: PlanFeature, doc: LockDoc = 'invoice'): LockSheetCopy {
  switch (feature) {
    case 'bank':
      return {
        icon: 'account_balance',
        title: 'Connect your bank',
        body: 'Deposits and card spending show up in Books on their own. Match a deposit to an invoice in one tap instead of typing it twice.',
      };
    case 'recurring':
      return {
        icon: 'event_repeat',
        title: 'Add a recurring expense',
        body: 'Rent, insurance, your phone bill. Enter it once and On It logs it every month. The recurring expenses you already have keep running.',
      };
    case 'attachments':
      return {
        icon: 'add_photo_alternate',
        title: `Add photos to this ${doc}`,
        body: 'Before and after shots, materials, damage. Photos go out with the PDF your client gets. Photos already on your documents stay.',
      };
  }
}

/** "Included in Plus · $16.99/mo", or null without a catalog. */
export function includedChip(lock: Pick<PlanLock, 'planRequired'>, catalog: PlanCatalog | null | undefined): string | null {
  const offer = offerOf(catalog, lock.planRequired);
  if (!offer || offer.monthlyCents == null) return null;
  return `Included in ${offer.name} · ${usd(offer.monthlyCents)}/mo`;
}

export interface LockActions {
  /** The gold button. */
  primary: string;
  /** The line under it (Pro only, board 4C). */
  note: string | null;
}

/**
 * The button block. Free with a trial: "Try Plus free for 14 days". Free and
 * returning (no trial): today's Subscribe wording. Pro: "Upgrade to Plus" and
 * the proration line. Null without a catalog: the sheet never invents a price.
 */
export function lockActions(
  lock: Pick<PlanLock, 'planRequired' | 'plan'>,
  catalog: PlanCatalog | null | undefined,
  trialEligible: boolean,
): LockActions | null {
  const offer = offerOf(catalog, lock.planRequired);
  if (!offer || offer.monthlyCents == null) return null;
  if (lock.plan === 'free') {
    return {
      primary: trialEligible
        ? `Try ${offer.name} free for ${offer.trialDays} days`
        : `Subscribe — ${usd(offer.monthlyCents)}/month`,
      note: null,
    };
  }
  return {
    primary: `Upgrade to ${offer.name}`,
    note: `You pay only the difference for the days left this month. ${offer.name} opens right away.`,
  };
}

export const LOCK_NOT_NOW = 'Not now';
export const LOCK_TRY_AGAIN = 'Try again';

/** The line above the paywall headline when a lock opened it, in the drawn
 *  pattern ("Connecting a bank is part of Plus."). */
export function lockPaywallReason(feature: PlanFeature, planName: string): string {
  switch (feature) {
    case 'bank': return `Connecting a bank is part of ${planName}.`;
    case 'recurring': return `Recurring expenses are part of ${planName}.`;
    case 'attachments': return `Adding photos is part of ${planName}.`;
  }
}

// ── 05 Photos skipped ───────────────────────────────────────────────────────

export interface SkippedPhotos {
  count: number;
  /** The source document's formatted number ("E-0051"), or null. */
  sourceDocNumber: string | null;
}

/** Show the notice? Only a real skip, and never to a Plus user (their photos copy). */
export function showPhotosSkipped(s: SkippedPhotos | null | undefined, plan: TierPlan | null): boolean {
  return Boolean(s && Number.isFinite(s.count) && s.count > 0 && plan !== 'plus');
}

export interface PhotosSkippedCopy {
  toastTitle: string;
  toastBody: string;
  inline: string;
  link: string;
}

export function photosSkippedCopy(s: SkippedPhotos, plusName: string): PhotosSkippedCopy {
  const n = Math.max(1, Math.floor(s.count));
  const photos = `${n} ${n === 1 ? 'photo' : 'photos'}`;
  const source = s.sourceDocNumber;
  return {
    toastTitle: 'Photos weren’t copied',
    toastBody: source
      ? `Adding photos is part of ${plusName}. ${source} keeps them.`
      : `Adding photos is part of ${plusName}. The original keeps them.`,
    inline: source
      ? `${photos} stayed on ${source}. Adding photos is part of ${plusName}.`
      : `${photos} stayed on the original. Adding photos is part of ${plusName}.`,
    link: `See ${plusName}`,
  };
}

/** The stored note on a document row (attachments_skipped / _from), as the
 *  notice reads it. `formatSource` is the shared doc-number formatter. */
export function skippedFromRow(
  row: { attachments_skipped?: unknown; attachments_skipped_from?: unknown } | null | undefined,
  formatSource: (n: number) => string,
): SkippedPhotos | null {
  const count = row?.attachments_skipped;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) return null;
  const from = row?.attachments_skipped_from;
  return {
    count: Math.floor(count),
    sourceDocNumber: typeof from === 'number' && Number.isInteger(from) && from > 0 ? formatSource(from) : null,
  };
}

/** Board 05 toast: dwell 8s, because it has an action. */
export const PHOTOS_TOAST_DWELL_MS = 8000;

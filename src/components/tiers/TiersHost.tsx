'use client';
// One host for the tiers sheets (design/tiers 04, 05), mounted once in
// AppShell behind NEXT_PUBLIC_TIERS. Screens ask through components/tiers/store:
// showPlanLock / openPlanLock for a lock, notePhotosSkipped after a convert,
// openPlanPaywall for a "See Plus" link.
//
// The sheet's button goes to the one purchase path. Until the plan page (01,
// PR D) and the native store exist, that is today's paywall: it opens with
// the lock's line above the headline, and the sheet closes behind it (4D spec).
import { useEffect } from 'react';
import PaywallModal, { type CheckoutReturn, type PaywallVariant } from '@/components/PaywallModal';
import LockSheet from './LockSheet';
import { PhotosSkippedToast } from './PhotosSkipped';
import {
  clearPhotosNotice, closePlanLock, closePlanPaywall, openPlanPaywall,
  useLockRequest, usePhotosNotice, usePlanPaywall, usePlanTiers,
} from './store';
import { includedChip, lockActions, lockPaywallReason, lockSheetCopy, offerOf, showPhotosSkipped } from '@/lib/plan-lock-view';
import type { PlanFeature } from '@/lib/plan-lock';

const RETURN_TO: Record<PlanFeature, CheckoutReturn> = { bank: 'books', recurring: 'recurring', attachments: 'invoices' };
const VARIANT: Record<PlanFeature, PaywallVariant> = { bank: 'invoice', recurring: 'recurring', attachments: 'invoice' };

export default function TiersHost() {
  const tiers = usePlanTiers();
  const request = useLockRequest();
  const photos = usePhotosNotice();
  const paywall = usePlanPaywall();

  // A lock whose plan already opens it (an upgrade landed meanwhile) has nothing to say.
  useEffect(() => {
    if (request && tiers.plan === 'plus') closePlanLock();
  }, [request, tiers.plan]);

  const plusName = offerOf(tiers.catalog, 'plus')?.name ?? null;
  const actions = request ? lockActions(request.lock, tiers.catalog, tiers.trialEligible) : null;

  return (
    <>
      {/* No catalog yet: no sheet that would have to invent a price. */}
      {request && actions && (
        <LockSheet
          key={request.key}
          copy={lockSheetCopy(request.lock.feature, request.doc)}
          chip={includedChip(request.lock, tiers.catalog)}
          actions={actions}
          isPro={request.lock.plan !== 'free'}
          onPrimary={() => {
            openPlanPaywall(request.lock.feature);
            // The paywall is up first; the sheet closes behind it.
            requestAnimationFrame(() => closePlanLock());
          }}
          onDismiss={closePlanLock}
        />
      )}
      {photos && plusName && showPhotosSkipped(photos, tiers.plan) && (
        <PhotosSkippedToast
          key={photos.key}
          skipped={photos}
          plusName={plusName}
          onSeePlus={() => openPlanPaywall('attachments')}
          onDone={clearPhotosNotice}
        />
      )}
      {paywall && (
        <PaywallModal
          variant={VARIANT[paywall]}
          reason={lockPaywallReason(paywall, plusName ?? '')}
          returnTo={RETURN_TO[paywall]}
          onClose={closePlanPaywall}
        />
      )}
    </>
  );
}

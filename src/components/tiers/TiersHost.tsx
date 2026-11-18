'use client';
// One host for the tiers sheets (design/tiers 04, 05), mounted once in
// AppShell behind NEXT_PUBLIC_TIERS. Screens ask through components/tiers/store:
// showPlanLock / openPlanLock for a lock, notePhotosSkipped after a convert,
// openPlanPaywall for a "See Plus" link.
//
// The sheet's button goes to the one purchase path. Until the plan page (01,
// PR D) and the native store exist, that is today's paywall: it opens with
// the lock's line above the headline, and the sheet closes behind it (4D spec).
import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics/track';
import { purchases } from '@/lib/subscription/start';
import { createPlanConfirmation } from '@/lib/subscription/confirm';
import { publishAccess } from '@/lib/upgrade-return';
import type { AccessRead } from '@/lib/access-poll';
import { CONFIRM_COPY } from '@/lib/paywall-plan-view';
import type { LockSheetState } from './LockSheet';
import PaywallModal, { type CheckoutReturn, type PaywallVariant } from '@/components/PaywallModal';
import LockSheet from './LockSheet';
import { PhotosSkippedToast } from './PhotosSkipped';
import {
  clearPhotosNotice, closePlanLock, closePlanPaywall, openPlanPaywall,
  useLockRequest, usePhotosNotice, usePlanPaywall, usePlanTiers,
} from './store';
import { includedChip, lockActions, lockSheetCopy, offerOf, showPhotosSkipped } from '@/lib/plan-lock-view';
import type { PlanFeature } from '@/lib/plan-lock';
import type { PaywallEntry } from '@/lib/paywall-entry';

const RETURN_TO: Record<PlanFeature, CheckoutReturn> = { bank: 'books', recurring: 'recurring', attachments: 'invoices' };
const VARIANT: Record<PlanFeature, PaywallVariant> = { bank: 'invoice', recurring: 'recurring', attachments: 'invoice' };
/** Page 3's top line and preselected plan (lib/paywall-entry): every lock is Plus. */
const ENTRY: Record<PlanFeature, PaywallEntry> = { bank: 'bank', recurring: 'recurring', attachments: 'photos' };

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
  // Board 04: a Pro user's lock button goes to the store directly (no
  // paywall), then waits on the server like paywall 1A. Free goes to the paywall.
  const [proState, setProState] = useState<LockSheetState>('idle');
  const [proError, setProError] = useState<{ icon: string; text: string } | null>(null);
  const proBusy = useRef(false);
  useEffect(() => { setProState('idle'); setProError(null); }, [request?.key]);

  async function upgradeFromSheet() {
    if (proBusy.current) return;
    proBusy.current = true;
    setProState('pending');
    setProError(null);
    try {
      track('checkout_started', { plan: 'plus', from: 'lock_sheet' });
      let out = await purchases.upgrade({ returnTo: 'settings' });
      if (out.status === 'confirming' || out.status === 'slow') {
        const c = createPlanConfirmation({ fetch: (u, i) => fetch(u, i), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), expect: 'plus' });
        out = await c.start();
      }
      if (out.status === 'success') {
        // The feature opens where the user tapped: the new access is published.
        const res = await fetch('/api/access').catch(() => null);
        if (res?.ok) publishAccess((await res.json()) as AccessRead);
        closePlanLock();
        return;
      }
      if (out.status === 'failed') { setProError({ icon: out.cause === 'store_only' ? 'install_mobile' : 'wifi_off', text: out.message }); setProState('error'); return; }
      if (out.status === 'slow') { setProError({ icon: 'schedule', text: CONFIRM_COPY.slow }); setProState('error'); return; }
      if (out.status === 'pending') return; // handed to the store / checkout page
      setProState('idle'); // cancelled: back to idle, no message
    } finally {
      proBusy.current = false;
    }
  }
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
          state={request.lock.plan === 'free' ? 'idle' : proState}
          error={proError}
          onPrimary={() => {
            if (request.lock.plan !== 'free') { void upgradeFromSheet(); return; }
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
          entry={ENTRY[paywall]}
          returnTo={RETURN_TO[paywall]}
          onClose={closePlanPaywall}
        />
      )}
    </>
  );
}

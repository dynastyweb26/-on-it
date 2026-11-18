// Tiers UI state shared across screens (design/tiers 04, 05), behind
// NEXT_PUBLIC_TIERS. One small module store, so a lock tapped on Books, the
// recurring form or a photo strip opens the same sheet from one host
// (TiersHost in AppShell), and a convert on any screen can hand the photos
// notice to the screen the user lands on.
//
// The plan and the catalog are read once from /api/access and re-read when
// access changes (a checkout, a redeemed code). Nothing here decides a limit:
// the plan is the server's, the lock shape is lib/plan-lock's.
import { useEffect, useSyncExternalStore } from 'react';
import { NEXT_PUBLIC_TIERS } from '@/lib/feature-flags';
import { PLAN_REQUIRED_BY, type PlanFeature, type PlanLock } from '@/lib/plan-lock';
import { tiersFromAccess } from '@/lib/ai-meter-view';
import type { TierPlan } from '@/lib/entitlements';
import type { PlanCatalog } from '@/lib/plan-catalog';
import type { LockDoc, SkippedPhotos } from '@/lib/plan-lock-view';
import { subscribeAccess } from '@/lib/upgrade-return';

export interface PlanTiers {
  loaded: boolean;
  plan: TierPlan | null;
  catalog: PlanCatalog | null;
  trialEligible: boolean;
}

export interface LockRequest { lock: PlanLock; doc: LockDoc; key: number }

interface State {
  tiers: PlanTiers;
  lock: LockRequest | null;
  photos: (SkippedPhotos & { key: number }) | null;
  /** The paywall a lock or the photos notice opened. */
  paywall: PlanFeature | null;
}

const EMPTY: PlanTiers = { loaded: false, plan: null, catalog: null, trialEligible: false };
let state: State = { tiers: EMPTY, lock: null, photos: null, paywall: null };
const listeners = new Set<() => void>();
let inflight: Promise<PlanTiers> | null = null;
let seq = 0;
let accessHooked = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Read the plan once (shared by every caller); `force` re-reads. A failed
 *  read leaves the plan unknown, and an unknown plan never shows a lock. */
export function loadPlanTiers(force = false): Promise<PlanTiers> {
  if (!NEXT_PUBLIC_TIERS) return Promise.resolve(EMPTY);
  if (!accessHooked && typeof window !== 'undefined') {
    accessHooked = true;
    subscribeAccess(() => { void loadPlanTiers(true); });
  }
  if (inflight && !force) return inflight;
  if (state.tiers.loaded && !force) return Promise.resolve(state.tiers);
  inflight = fetch('/api/access')
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      if (!body) return state.tiers;
      const t = tiersFromAccess(body);
      const tiers: PlanTiers = {
        loaded: true,
        plan: t.plan,
        catalog: t.catalog,
        trialEligible: (body as { trialEligible?: unknown }).trialEligible === true,
      };
      set({ tiers });
      return tiers;
    })
    .catch(() => state.tiers)
    .finally(() => { inflight = null; });
  return inflight;
}

export function usePlanTiers(): PlanTiers {
  const tiers = useSyncExternalStore(subscribe, () => state.tiers, () => EMPTY);
  useEffect(() => { void loadPlanTiers(); }, []);
  return tiers;
}

/** The lock a feature has for this user right now, or null (flag off, plan
 *  unknown, or the plan already opens it). Drives the entry cue and the tap. */
export function lockFor(feature: PlanFeature, plan: TierPlan | null): PlanLock | null {
  if (!NEXT_PUBLIC_TIERS || !plan) return null;
  const needs = PLAN_REQUIRED_BY[feature];
  if (plan === needs || plan === 'plus') return null;
  return { error: 'plan_required', feature, planRequired: needs, plan };
}

export function usePlanLock(feature: PlanFeature): PlanLock | null {
  return lockFor(feature, usePlanTiers().plan);
}

/** Open the lock sheet for a typed lock (a refusal, or a locked tap). */
export function showPlanLock(lock: PlanLock, doc: LockDoc = 'invoice'): void {
  if (!NEXT_PUBLIC_TIERS) return;
  set({ lock: { lock, doc, key: ++seq } });
}

/** Open the sheet for a feature from the current plan (reads it first if needed). */
export async function openPlanLock(feature: PlanFeature, doc: LockDoc = 'invoice'): Promise<boolean> {
  if (!NEXT_PUBLIC_TIERS) return false;
  const t = await loadPlanTiers();
  const lock = lockFor(feature, t.plan);
  if (!lock) return false;
  showPlanLock(lock, doc);
  return true;
}

export function closePlanLock(): void {
  if (state.lock) set({ lock: null });
}

export function useLockRequest(): LockRequest | null {
  return useSyncExternalStore(subscribe, () => state.lock, () => null);
}

/** Board 05: hand the photos notice to whichever screen the user lands on. */
export function notePhotosSkipped(s: SkippedPhotos | null | undefined): void {
  if (!NEXT_PUBLIC_TIERS || !s || !(s.count > 0)) return;
  set({ photos: { ...s, key: ++seq } });
}

export function clearPhotosNotice(): void {
  if (state.photos) set({ photos: null });
}

/** Open the purchase path for a feature's plan (today: the paywall, PR D: page 3). */
export function openPlanPaywall(feature: PlanFeature): void {
  if (!NEXT_PUBLIC_TIERS) return;
  set({ paywall: feature });
}

export function closePlanPaywall(): void {
  if (state.paywall) set({ paywall: null });
}

export function usePlanPaywall(): PlanFeature | null {
  return useSyncExternalStore(subscribe, () => state.paywall, () => null);
}

export function usePhotosNotice(): (SkippedPhotos & { key: number }) | null {
  return useSyncExternalStore(subscribe, () => state.photos, () => null);
}

/** /dev fixtures only: seed the plan so the real paywall can be opened as
 *  Free, Pro or Plus without an account. Production never calls it (the
 *  /dev pages 404 there). */
export function seedPlanTiersForDev(tiers: PlanTiers): void {
  if (process.env.VERCEL_ENV === 'production') return;
  set({ tiers: { ...tiers, loaded: true } });
}

# Tiers phase 5: RevenueCat plan (native subscriptions)

Status: plan. Nothing here is built. Lands with the native wrap.

Goal: Pro and Plus are sold through the App Store and Google Play via RevenueCat.
RevenueCat's webhook writes `profiles.plan` and `access_tier`. Stripe stops selling
new subscriptions at the native launch.

## 0. Founder setup (accounts and keys, no code)

1. Apple Developer Program ($99/yr). Check: an organization account needs a legal
   entity and a D-U-N-S number; as a sole proprietor you may have to enroll as an
   individual (your name shows as the seller). Decide before you enroll.
2. Google Play Console ($25 one time).
3. App Store Connect: one subscription group "On It" with two auto-renewing monthly
   products, Plus ranked above Pro (that ranking is what makes upgrades immediate and
   downgrades wait for renewal). Each product gets a 14-day free trial introductory
   offer.
4. Play Console: two subscriptions with a monthly base plan and a 14-day trial offer.
5. RevenueCat project: both apps, both stores' products, entitlements `pro` and
   `plus` (the Plus product unlocks both), one offering holding the two packages.
6. Keys into Vercel (never in the repo): RevenueCat public SDK keys (iOS, Android),
   secret API key (server), webhook Authorization value.

## 1. Who is the user (identity)

- RevenueCat `app_user_id` = the Supabase user id. Call `logIn(user.id)` after sign-in
  and `logOut()` on sign-out. No anonymous purchases: the paywall needs a signed-in
  user (it already does).
- `TRANSFER` events (same store account moved to another On It user) re-sync both
  users.

## 2. Database (Freebuff, one additive migration)

- `profiles.billing_source` text, check `stripe | app_store | play_store`, nullable.
  Privileged (no client write), privilege-check rows.
- `profiles.plan_change_to` text (check `pro | plus`) + `profiles.plan_change_at`
  timestamptz: a downgrade waiting for renewal, for "Plus until Dec 15, then Pro".
  Privileged.
- `revenuecat_events`: event id (unique), type, user id, received_at, processed_at.
  RLS on, no client access. This makes the webhook idempotent.
- Backfill: `billing_source = 'stripe'` where `stripe_customer_id` is set.

## 3. Webhook: `/api/webhooks/revenuecat` (Freebuff)

- Check the Authorization header in constant time against the env value. Wrong or
  missing = 401. Optionally turn on HMAC signing too.
- Production deploy ignores sandbox events; preview takes only sandbox.
- Insert the event id first; already there = return 200 and stop.
- Do not trust the event's snapshot. Call the RevenueCat REST API for the subscriber
  and derive the state from the current entitlements. This handles out-of-order and
  retried deliveries, and new event types, with one code path.
- Derivation (one pure function, unit-tested per case):
  - `plus` entitlement active = plan plus; else `pro` active = plan pro.
  - In trial = `trialing`; active = `active`; billing issue / grace period =
    `past_due`; no active entitlement = `canceled` (plan value kept).
  - `cancel_at_period_end` from "will not renew"; `current_period_end` from the
    expiry date.
  - A scheduled product change to a lower product = `plan_change_to` / `_at`.
- Revoke access only when nothing is active (RevenueCat's `EXPIRATION`), never on
  `CANCELLATION`.
- Founder rows are never touched (reuse `updateUnlessFounder`).
- Unknown event types: 200, logged.
- Fails on DB error = 500 so RevenueCat retries.

## 4. Stripe and the store side by side (fixes the phase 1 risk)

Today every Stripe event writes `plan = 'pro'`. Once Plus is sold in the store, a late
Stripe event could knock a Plus user back to Pro.

- `billing_source` decides who may write a profile's billing fields. Stripe sync writes
  only when it is null or `stripe`; the RevenueCat webhook writes only when it is null
  or a store. The write sets `billing_source` in the same UPDATE.
- At the native launch Stripe checkout stops selling new subscriptions (flag). A
  user who already pays through Stripe keeps it until they cancel. The native paywall
  shows them "You're billed on the web" instead of a buy button, so nobody pays twice.
- Nobody pays yet, so this is mostly insurance.

## 5. App side (Freebuff wiring, Claude Code UI from the phase 3 design)

- SDK: `@revenuecat/purchases-capacitor` if the wrap is Capacitor (wrap choice still
  open; the plan holds for any wrapper with a RevenueCat SDK).
- Paywall CTA calls `purchasePackage`. On success, poll `/api/access` until `plan`
  matches (spec rule: the screen waits, never guesses). 20s without a match = the
  "confirming" state with retry.
- `src/lib/subscription/restore.ts` body becomes `restorePurchases`, then the same poll.
- Upgrade / downgrade:
  - iOS: buying Plus from Pro in the same group is an immediate upgrade with a
    prorated refund; buying Pro from Plus waits for renewal. Matches the founder's
    decisions with no custom logic.
  - Android: upgrade with the charge-prorated replacement mode, downgrade with the
    deferred mode.
- Cancel: the store owns it. The in-app cancel flow keeps the reasons and offers;
  its final button opens the store's manage page (RevenueCat management URL).
  - 50% off for 2 months = a store promotional offer (Apple needs a subscription
    offer key; Google an offer on the base plan).
  - Pause exists on Google only. On iOS "Slow season" offers the Pro switch.
- `/api/access` adds `billingSource`, `planChangeTo`, `planChangeAt` for Settings > Plan.

## 6. Turning it on

1. Apple paywall rules (App Store guideline 3.1.2): price, period, auto-renew, how to
   cancel, links to Terms and Privacy on the paywall itself.
2. Update Terms, EULA and Privacy Policy (store billing, RevenueCat as a processor).
3. Sandbox test every path on the test database: new trial, trial to paid, upgrade,
   downgrade + undo, cancel + expire, billing issue, restore on a second device,
   refund.
4. New migration: `tiers_enforced()` returns true. Vercel: `NEXT_PUBLIC_TIERS=true`.
   Both together, after the store builds are approved.

## Order of work

1. Founder: section 0 (accounts take days; start early).
2. Freebuff: migration + webhook + derivation tests (sections 2-4), on the test DB.
3. Claude Code: phase 4 UI from the phase 3 design, wired to the SDK.
4. Sandbox pass (section 6.3), then store review, then flags on.

## Founder decisions still open

- Apple enrollment: individual or organization (see 0.1).
- Wrapper: Capacitor or other (decides the SDK package).
- Whether Stripe customers can switch to the store on their own or must cancel first.

# Native wrap: On It on iOS and Android

Status: plan. Nothing here is built.

## Decisions (founder, 2026-11-20)

- **Shell over the live app.** A Capacitor app that loads `https://onit.dynastyweb.co`,
  plus real native parts. Not a bundled export (Next.js server pages and API routes
  don't static-export) and not an Expo rewrite. Every web deploy updates the app.
- **Apple Developer: individual enrollment now.** Seller shows as Brandon Fotsing
  Talla. Transfer to a company account after the LLC exists.
- **iOS first, Android second.**
- **Builds on Codemagic** (no Mac).
- **Subscriptions through RevenueCat**: see `REVENUECAT-PLAN.md`, which this spec
  does not repeat.

## The rule that decides App Review

A shell that is "just the website" gets rejected (App Review guideline 4.2, minimum
functionality). The app must feel and act native. Every item marked **(4.2)** below
is part of passing review, not polish.

## Phase 0: Founder accounts (no code)

1. Apple Developer Program, individual. Then App Store Connect: app record, bundle id
   `co.dynastyweb.onit`.
2. Codemagic account, connected to GitHub `dynastyweb26/-on-it`.
3. RevenueCat account (steps in `REVENUECAT-PLAN.md` §0).
4. A test iPhone for TestFlight (your own phone is fine).
5. Google Play Console ($25 one time): only when iOS is in review.

## Phase 1: The shell

1. Capacitor project in `native/` (its own `package.json`); the web app is unchanged.
2. `server.url` = production; preview builds can point at a preview URL for testing.
3. App icon and splash from the existing brand assets (white swoosh on gold tile).
4. Status bar, safe areas, no bounce scroll, no text selection callouts **(4.2)**.
5. Offline screen in the app (not the browser's error page) **(4.2)**.
6. Links that leave On It (pay links, Stripe, Terms) open in the system browser or an
   in-app browser sheet, never inside the shell.
7. Inside the app: hide the PWA install banner and `/install`.
8. `isNative()` helper (Capacitor platform check) used by every rule below.

## Phase 2: Sign-in

1. Google blocks sign-in inside embedded web views. Google sign-in opens the system
   auth sheet and returns to the app by a deep link (`onit://auth/callback`).
2. Sign in with Apple is required whenever Google is offered (guideline 4.8). The code
   path exists (`AuthSheet` `oauth('apple')`); it needs the Apple key in Supabase.
3. Universal Links (`apple-app-site-association` on onit.dynastyweb.co) for
   `/auth/callback`, `/pay/*`, `/e/*`, `/i/*` and Plaid's OAuth return.

## Phase 3: Payments (from `REVENUECAT-PLAN.md`)

1. RevenueCat SDK; the `purchases` adapter swaps from web to store when `isNative()`.
2. In the iOS app nothing links to Stripe subscription checkout (guideline 3.1.1).
   Invoice payments through Stripe Connect stay: they are real-world services.
3. Restore Purchases on the paywall. Terms, Privacy and EULA links on the paywall.
4. The 50% Plus retention offer becomes an App Store promotional offer.
5. Sandbox run of every store path on the test database before launch.

## Phase 4: Native features (4.2)

1. Push: native push (OneSignal or APNs directly) for the existing notifications.
   Web push does not work inside the shell.
2. Haptics on the moments the app already celebrates (payment recorded, sent,
   subscribed), same spirit as the toasts.
3. Camera and photo permissions with plain-language reasons; the in-app receipt camera.
4. Permission prompts at the moment of use, never on first launch.

## Phase 5: Store and review

1. App Privacy labels matching `privacy-policy.md` (Sentry, PostHog, Plaid, camera,
   push token).
2. Screenshots (Canva), preview video (Raylight).
3. Review demo account with full Plus access, granted server side, sample data loaded.
4. Account deletion reachable in Settings (exists; retest inside the app).
5. Before submit: merge Sentry (#232) and PostHog (#233), turn `NEXT_PUBLIC_TIERS` on.

## Who builds what

- Founder: Phase 0, App Store Connect, RevenueCat dashboard, store listing.
- Freebuff: `native/` project, Capacitor config, deep links, AASA file, push, Codemagic
  workflow, RevenueCat wiring and webhook (per `REVENUECAT-PLAN.md`).
- Claude Code: anything visible (offline screen, permission explainers, paywall
  restore row) from Claude Design files only.
- Claude chat: review every diff that touches auth, payments or the webhook.

## Order

Phase 0 → 1 → 2 → TestFlight build on your phone → 3 → 4 → 5 → submit iOS → Android.

# Tiers UI (phase 4) build rules

Source of truth: the two Claude Design boards in this folder (founder round,
2026-11-16). The built app must match them. Spec: TIERS-SPEC.md. Brief the
boards were drawn from: TIERS-DESIGN-BRIEF.md.

- `Tiers_1_Paywall_and_AI.dc.html`: 01 Paywall plan page, 02 AI meter,
  03 AI limit card.
- `Tiers_2_Locks_Plan_Cancel.dc.html`: 04 Lock sheets, 05 Photos skipped
  notice, 06 Settings > Plan, 07 Cancel flow two-plan additions.

Founder decisions:

1. Paywall pages 1 (demos) and 2 (trial timeline) stay exactly as they are.
   Only page 3 is replaced by board 01.
2. Cyril's testimonial stays as it is today: same quote, logo, name and
   styling. It always renders.
3. No "Voice invoicing" row anywhere (voice is vaulted).
4. A founder-code account reads "Founder" (the Settings title chip already
   does, via `planLabel` in `src/lib/entitlements.ts`).
5. Everything here ships behind `NEXT_PUBLIC_TIERS`. With the flag off the app
   looks and behaves exactly as it does today.
6. The boards say "App Store" and sell Plus. That is only true after the native
   wrap (REVENUECAT-PLAN.md), so none of this is switched on before then. No
   $16.99 Stripe price is built.
7. Small error and pending states the boards do not draw reuse the error
   message look already in the app (founder, 2026-11-13). Anything bigger
   stops and asks.
8. Plan names "Pro" and "Plus" are display names kept in one place, so a
   rename is one edit.

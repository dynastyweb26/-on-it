# On It — Cancel Flow Spec (cancel button, one retention offer, stats panel)

_Founder decisions 2026-10-16. Build on its own branch (`feat/cancel-flow`),
one commit per item below. Step 0 is an audit of the current code: if anything
here disagrees with what the audit finds, stop and flag it before building._

## 0. Rules

1. No emojis anywhere (code, copy, comments). Material Symbols Outlined only.
2. Warm Premium: cream `#fff8f0`, gold `#d4af37` as fill only, text-safe gold
   `#735c00`, Montserrat 700/800 headings, Inter body.
3. **Cancel is never more than two taps from Plan:** Plan → "Cancel
   subscription" → "Cancel subscription". No confirm dialog, no "are you sure"
   page, no live agent, no email-to-cancel.
4. **One screen, one offer.** The stats panel, the reason picker, the single
   matching offer, and the cancel button all live on the same screen. The
   cancel button is visible the whole time, before and after a reason is
   picked, styled as a real button (`btn-outline`, full width), never a text
   link. California's auto-renewal law allows one save attempt and requires the
   cancel option to be shown alongside it; ROSCA requires a simple way to stop
   recurring charges. Rule 3 + 4 satisfy both.
5. **Honest copy.** Canceling does not delete data. They drop to the free tier
   at the end of the paid period and keep their history. Copy says "what you've
   built," never "you'll lose all this." No guilt copy ("You're leaving us?",
   "We'll miss you"), no countdowns, no fake urgency.
6. The reason is optional. Not picking one never blocks canceling.
7. Founders (redeemed code) have no subscription and never see any of this.

## 0a. Decisions (founder, 2026-10-16)

| # | Decision |
|---|---|
| D1 | Explicit "Cancel subscription" button on Plan, below "Manage subscription". |
| D2 | Cancel = `cancel_at_period_end: true`. Access stays until the period (or trial) ends. Plan then shows the end date and a "Resume subscription" button until it ends. |
| D3 | Reason → one offer (table in §3). "Too expensive" → **50% off the next 2 monthly charges** (not a free month: keeps the payment habit, about the same cost to us). "Slow season / not using it" → **pause 1, 2 or 3 months**. "Missing a feature" → capture the request + point at the free tier. "Switching / done" and "Other" → no offer. |
| D4 | One retention offer per user per 12 months. Inside that window the reason picker still shows, but no offer appears (they go straight to cancel). |
| D5 | Stats panel at the top of the cancel screen: up to 4 numbers about what they've built (§2). Hidden when the user has fewer than 3 sent invoices; the offer leads instead. |
| D6 | Once this ships, turn **off** cancellation in the Stripe Billing Portal config (dashboard, founder action) so every cancel goes through the in-app flow and logs a reason. The portal stays for updating the card. |

## 0b. Step 0 — audit (before any code)

Confirm or correct each of these, and write the findings at the top of the
branch's PUNCH-LIST section:

1. Plan today: `SettingsView.tsx` `is('plan')` block. Subscribed users see
   "Manage subscription" → `/api/billing-portal` and the line "Cancel or update
   your card in the billing portal." So cancel exists today, but only inside
   Stripe's portal. Founders and free/canceled users have no subscription.
2. Webhook (`src/app/api/webhooks/stripe/route.ts`): `applySubscription` writes
   `subscription_status`, `current_period_end`, `trial_ends_at`. It does **not**
   record `cancel_at_period_end` or `pause_collection`. `tierFromStatus` maps
   Stripe status `paused` → `canceled`, but `pause_collection` leaves the status
   `active`, so a paused subscription would keep full access unless §4 is built.
3. `src/app/api/redeem/route.ts` already sets `cancel_at_period_end` on live
   subscriptions when a founder code is redeemed. The new columns must not
   break that path (it should show the founder row, not the "Resume" row).
4. Stats sources (§2): confirm the exact columns and the soft-delete filter
   (`deleted_at` or equivalent) for invoices, `invoice_payments`, and clients.
5. Stripe: which API version the project pins, and whether `discounts` or
   `coupon` is the right field on `subscriptions.update` for that version.

## 1. Plan screen changes

Subscribed (`trialing` / `active` / `past_due`), not canceling:

- Existing copy + "Manage subscription" stay. Change the helper line to
  "Update your card in the billing portal."
- New full-width `btn-outline` **"Cancel subscription"** → `/settings/plan/cancel`.
- `past_due`: show Cancel too. No offer on the cancel screen for `past_due`
  (they're already failing to pay; a discount there is a support issue, not
  retention).

Subscribed and canceling (`cancel_at_period_end` true, not a founder):

- Copy: "Your plan ends {date}. You keep everything; after that you're on the
  free plan (3 invoices and 5 expenses a month)." Use `current_period_end`, or
  `trial_ends_at` while trialing. Check the free-tier wording against
  `freePlanSummary` / `lib/usage` so the numbers come from one place.
- `btn-primary` **"Resume subscription"** → `POST /api/subscription/resume`
  (sets `cancel_at_period_end: false`). No offer, no friction.
- "Cancel subscription" is hidden while canceling.

Paused (§4): "Paused until {date}. Your plan picks back up then." plus
**"Resume now"** (clears `pause_collection`).

## 2. Stats panel ("What you've built")

Top of the cancel screen, recap visual style (number first, label under it),
2×2 grid on phone. All numbers are lifetime, the user's own rows, excluding
soft-deleted rows.

| Tile | Number | Source |
|---|---|---|
| Invoices sent | count | invoices with `sent_at` not null |
| Collected through On It | currency sum | `invoice_payments.amount` |
| Average days to get paid | 1 decimal | mean of `paid_at - sent_at` (days) over fully paid invoices that have both; omit the tile if fewer than 3 |
| Clients saved | count | saved clients (the same source as the Clients tab) |

- Rules: a tile with 0 or no data is dropped, not shown as "0". If fewer than
  2 tiles survive, hide the panel.
- Hide the whole panel when invoices sent < 3 (D5).
- One server endpoint, `GET /api/subscription/cancel-summary`, session client
  (RLS), returns the numbers + `offerEligible` + `tier`. No new migration for
  the stats.
- Under the grid, one line: "Your history stays. Recaps, reports and unlimited
  invoices end with your plan." Check against what the paywall actually gates
  (the 4 paywall benefits) and match them.

## 3. Reason picker + offer

Heading: "Before you go" (Montserrat 700). Subheading: "Mind telling us why?
It's optional."

Single-select rows (Material Symbols icon + label):

| Reason key | Label | Offer (if `offerEligible`) |
|---|---|---|
| `price` | Too expensive | **50% off your next 2 months.** "$4.99/month for your next 2 months, then $9.99/month. Cancel anytime." Button: "Take 50% off". |
| `seasonal` | Slow season / not using it right now | **Pause instead.** Segmented 1 / 2 / 3 months. "No charges while paused. Your plan picks back up {date}." Button: "Pause for N months". |
| `feature` | Missing something I need | Text field "What's missing?" (optional, 500 chars) → saved with the reason. Line: "Your data stays on the free plan, and we read every request." No discount. |
| `switching` | Switching to another app | none |
| `other` | Something else | Optional text field, no offer |

Offer rules:

- Only one offer card is ever visible: the one for the picked reason.
- `trialing`: `price` offer applies to the first 2 paid months (copy: "When
  your trial ends, $4.99/month for 2 months, then $9.99/month."). `seasonal`
  is not offered during a trial (nothing to pause); show no offer.
- `past_due`: no offers.
- Not `offerEligible` (D4): reasons still selectable, no offer card.
- Taking an offer: apply it, log it, return to Plan with a notice ("Done. 50%
  off your next 2 months." / "Paused until {date}."). No cancel happens.

Bottom of the screen, always visible: **"Cancel subscription"** (`btn-outline`,
full width) + one line: "You keep your plan until {date}."

Cancel → `POST /api/subscription/cancel` with `{ reason?, detail? }` → done
state on the same screen: "Canceled. Your plan ends {date}." + "Resume
subscription" + "Back to Settings".

## 4. Server + data

New routes (all: session client for auth, `rateLimit`, Stripe via
`getStripe()`, dormant-safe 503 like `billing-portal`, never trust the client
for the offer — eligibility is re-checked server-side):

- `POST /api/subscription/cancel` → `cancel_at_period_end: true`, log row,
  send cancellation confirmation email (Resend, existing sender).
- `POST /api/subscription/resume` → `cancel_at_period_end: false`, or clear
  `pause_collection` when paused.
- `POST /api/subscription/offer` with `{ kind: 'discount' | 'pause', months? }`
  → discount: apply coupon from env `STRIPE_RETENTION_COUPON_ID` (50% off,
  `duration: repeating`, `duration_in_months: 2`); pause:
  `pause_collection: { behavior: 'void', resumes_at }`. Log row.
- `GET /api/subscription/cancel-summary` (§2).

Migration (founder approval before applying, as usual):

- `profiles.cancel_at_period_end boolean not null default false`
- `profiles.paused_until timestamptz` (null when not paused)
- `profiles.retention_offer_used_at timestamptz`
- New table `cancel_events` (`id`, `user_id`, `kind` in
  `('cancel','resume','offer_discount','offer_pause')`, `reason`, `detail`,
  `months`, `created_at`). RLS: owner insert/select only; service role for
  writes from the routes is fine too. Add the new privileged `profiles` columns
  to the same lock as `access_tier` / `current_period_end` (see
  `20260925000001_profiles_lock_privileges.sql`) so a client can't set them.
- Privcheck: add rows for the new columns + table.

Webhook (`applySubscription`): also write `cancel_at_period_end` and
`paused_until` (from `pause_collection.resumes_at`). While `pause_collection`
is set, the access tier is the free tier (`canceled`), not `active`, through
`setTierUnlessFounder`. When the pause clears, the normal status mapping takes
over again.

Env: `STRIPE_RETENTION_COUPON_ID` in both Preview (test-mode coupon) and
Production (live coupon). Founder creates both coupons in the Stripe dashboard.
`NEXT_PUBLIC_` is not needed (server only).

## 5. Commits (one per item)

1. `chore(db): cancel flow columns + cancel_events` (migration + privcheck rows)
2. `feat(stripe): webhook records cancel_at_period_end and pause`
3. `feat(subscription): cancel and resume routes`
4. `feat(subscription): retention offer route (discount, pause)`
5. `feat(subscription): cancel summary endpoint`
6. `feat(settings): Cancel / Resume / Paused states on Plan`
7. `feat(settings): cancel screen (stats, reasons, offer)`
8. `feat(email): cancellation confirmation`
9. `test(subscription): fixtures for eligibility, tiers, stats thresholds`

## 6. Tests (preview, Stripe test mode)

1. Active user: Plan → Cancel → Cancel, two taps, no reason picked. Stripe
   shows `cancel_at_period_end`. Plan shows end date + Resume. Email arrives.
2. Resume from (1): flag cleared in Stripe and in the profile; Plan back to
   normal.
3. `price` → Take 50% off: next upcoming invoice in Stripe is $4.99; second is
   $4.99; third is $9.99. Plan unchanged, notice shown, `cancel_events` row.
4. Same user tries again within 12 months: reasons show, no offer card.
5. `seasonal` → Pause 2 months: no invoice while paused; access drops to free
   limits; Plan shows "Paused until"; Resume now restores access.
6. Trialing user: `price` shows the post-trial copy; `seasonal` shows no offer;
   cancel ends at `trial_ends_at` and no charge happens.
7. `past_due` user: Cancel visible, no offer.
8. User with 2 sent invoices: no stats panel. User with history: tiles match
   Books / Clients numbers; a zero tile is dropped.
9. Founder: no Cancel button, no cancel screen (direct URL redirects to Plan).
10. Hard refresh mid-flow and on the done state: state comes from the server,
    not local state.
11. After merge (founder, dashboard): disable cancellation in the Billing
    Portal config; confirm the portal still updates the card.

## 7. Not in this spec

- Annual plan + California yearly reminder email (separate punch-list row).
- Win-back emails after cancellation.
- Native app (Apple handles subscription cancellation there; this flow is the
  web/PWA subscription only).

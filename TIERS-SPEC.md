# Tiers spec (founder decisions, 2026-11-15)

Status: planned. Nothing here is live. Every gate below ships behind
`NEXT_PUBLIC_TIERS` (off in production) until the higher plan can be bought.

## Plans

| | Free | Pro ($9.99/mo) | Plus ($16.99/mo) |
|---|---|---|---|
| Invoices | 3 | unlimited | unlimited |
| Estimates | 3 | unlimited | unlimited |
| Expenses | 5 | unlimited | unlimited |
| Recaps | 2 weekly | all | all |
| Income / expense PDFs | no | yes | yes |
| AI questions per day | 5 | 30 | 100 |
| Bank activity (Plaid) | no | no | yes |
| Recurring expenses | no | no | yes |
| Attachments | no | no | yes |

- Stored plan values: `pro`, `plus`. Display names are the founder's call.
- Founder code = Plus. A trial runs on the plan the user picked.
- The $30 tier and voice are vaulted.
- Free limits are unchanged from today (the SQL `free_*_limit()` functions).

## Rules

1. One source of truth: a pure `entitlementsFor(tier, plan)` in
   `src/lib/entitlements.ts`. No route, trigger or screen decides a limit on
   its own. SQL gates and the function must agree, with a test that proves it.
2. Server enforces, the screen explains. Every limit is enforced on the server
   or in the database; the UI only shows it.
3. No surprises. A limit is visible before it is hit ("2 of 5 left today"),
   a lock names the plan that opens it, and a refusal says when it resets.
4. Keep what exists, gate what is new. Existing attachments, recurring
   expenses and a connected bank keep working after the gates turn on. Adding
   a new one needs Plus.
5. The core job is never blocked by the AI limit. At the daily limit, AI
   questions and AI changes pause until the owner's local midnight. Creating
   invoices, estimates and expenses in the builder still works.
6. `profiles.plan` is a privileged column: only the billing webhook writes it.

## AI daily limit

- Counts `/api/ask` turns: `chat_messages` rows for the user since local
  midnight in `profiles.timezone`. No new table.
- Checked before the model is called. Over the limit: no model call, a typed
  `limit` answer with used, limit and the reset time.
- The per-minute rate limit stays as it is.

## Changing plans (founder decisions, 2026-11-15)

- Upgrade (Pro to Plus): starts now. The user pays only the difference for the
  days left in the paid period. Plus features open as soon as the billing
  webhook writes `profiles.plan`; the screen waits for that, never guesses.
- Downgrade (Plus to Pro): takes effect at the end of the paid period. Until
  then the user keeps Plus. Settings > Plan says "Plus until {date}, then Pro",
  with an undo. No refunds.
- After a downgrade, rule 4 applies: existing attachments, recurring expenses
  and a connected bank keep working; adding new ones needs Plus.
- Entry points for an upgrade: every lock sheet, the AI limit card, and
  Settings > Plan.

## Cancel flow with two plans

The live flow (CANCEL-FLOW-SPEC.md) stays: stats panel, optional reason, one
offer per user per 12 months, cancel button always visible.

| Reason | On Pro | On Plus |
|---|---|---|
| Too expensive | 50% off the next 2 months | Pick one: switch to Pro, or 50% off the next 2 months |
| Slow season / not using it | Pause 1, 2 or 3 months | Same |
| Missing something I need | Capture the request. If Plus has it, show Plus | Capture the request |
| Switching / done, Other | No offer | No offer |

- Switching to Pro from the cancel screen is a downgrade (end of period) and
  counts as the offer taken.
- Native stores (to confirm at the wrap, phase 5): the store owns the cancel
  and the billing. The reason screen and offers stay in the app; the discount
  becomes a store promotional offer through RevenueCat; the final cancel
  button opens the store's manage-subscription page. Pause may not exist on
  every store; where it does not, that reason offers the Pro switch instead.

## Phases

1. Entitlements core (Freebuff). Additive migration: `profiles.plan`
   (nullable, check `pro|plus`, privileged, privilege-check row). Backfill:
   founder = plus; trialing, active, past_due = pro. `entitlementsFor`,
   returned by `/api/access`. No behaviour change.
2. Server gates behind the flag (Freebuff). AI daily limit; Plaid link and
   exchange need Plus; new recurring expenses need Plus; new attachment
   uploads need Plus. Each with tests and privilege-check rows.
3. Design round (founder, Claude Design). Two-plan paywall page; AI meter and
   the limit card; lock sheets for bank, recurring and attachments; Settings >
   Plan with usage. Every state listed: idle, pending, error, repeat-tap.
4. UI build (Claude Code) from that design.
5. At the native wrap: RevenueCat sells both plans and writes
   `profiles.plan`; Terms, EULA and paywall disclosures updated; flag on.

Stripe: no $16.99 Stripe price is built. Today's $9.99 Stripe checkout keeps
working until RevenueCat replaces it.

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

# Refunds & disputes — test plan (branch `fix/disputes-refunds`)

Tests the Connect refund/dispute handling on the **branch preview** with a
**dedicated test seller** connected to a **Stripe sandbox** account. Never use
the founder's account or Cyril's. Preview and production share one database,
so everything below writes real rows. They belong only to the test seller.

## 0. Before you start

- Migration `20261005000000_payment_reversals.sql` is applied (dry run, explicit
  yes, push, `npm run db:privcheck`, row P added once `feat/paywall-v2` is
  merged). **The branch code must not take events before this**: it writes
  `stripe_payment_intent_id` and reads `entry_type` / `refunded_amount`.
- The branch preview is deployed and aliased to
  `onit-dynastyweb-preview.vercel.app` (CLAUDE.md deploy workflow).
- CLAUDE.md's rule "never tap Connect/Finish setup on the preview" protects
  *your* profile. The steps below tap Connect **only while signed in as the
  test seller**, in a private window.

## 1. Subscribe the sandbox Connect destination to the new events

Stripe Dashboard → **sandbox** → Developers → Event destinations → the
snapshot destination listening to **Connected accounts** (the one whose
secret is the preview's `STRIPE_CONNECT_WEBHOOK_SECRET`) → Edit events → add:

```
charge.refunded
refund.created
refund.updated
refund.failed
charge.dispute.created
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
charge.dispute.closed
```

Do the same on the live destination `onit-live-connect`, but only right
before this branch merges to `main`.

## 2. Create the test seller

1. Open a **private/incognito window** and go to
   `https://onit-dynastyweb-preview.vercel.app`. Make sure you're not signed
   in as yourself.
2. Sign up with a dedicated address, e.g. `deffeufotsing+onit-seller@gmail.com`.
3. Onboarding: business name **ZZ Test Seller**, any trade, any colours.
4. Read-only check that it's a separate profile (SQL Editor):
   `select id, business_name, stripe_account_id from public.profiles where business_name = 'ZZ Test Seller';`
   Note the `id`. That's the only profile any test row may belong to.

## 3. Connect it to a Stripe sandbox account

1. Still signed in as the test seller: Settings → **Connect Stripe**.
2. Fill in Stripe's sandbox onboarding with test data: phone `000 000 0000`,
   SMS code `000000`, SSN `000-00-0000`, DOB `01/01/1901`, address
   `address_full_match`, routing `110000000`, account `000123456789`.
3. Back in Settings, wait for **Connected** and turn on **Accept card payments**.
   If it sits at "In review" (as on 2026-09-25), check why in the sandbox
   Dashboard before going on.
4. Re-run the SQL from step 2.4: `stripe_account_id` is now an `acct_` id on
   the test seller's row only. Your own row is unchanged.

## 4. Scenarios

For each: as the test seller, create an $850 invoice for **Mike Davis**, Send
it, open the pay link in another private window, and pay by card. Then act in
the sandbox Dashboard, viewing the **connected account** (Connect → the test
account → Payments).

| # | Pay with | Then | Expect in On It |
|---|---|---|---|
| 1 Full refund | `4242 4242 4242 4242` | Refund → full $850 | History row **Refund −$850.00**, no Delete. Status **Refunded**. Owed $0. Pay link still closed. Books Collected −$850 in this month; the payment month unchanged. No followup. |
| 2 Partial refund | `4242 4242 4242 4242` | Refund → $200 | **Refund −$200.00**. Status **Refunded $200.00**. Owed $0. |
| 3 Dispute lost | `4000 0000 0000 0259` (auto-disputed) | Respond with evidence text `losing_evidence` (or Accept dispute) | Push **"Mike Davis disputed $850.00"**. **Dispute −$850.00**. Status **sent**. Owed $850. Pay link reopens. |
| 4 Dispute won | `4000 0000 0000 0259` | Respond with evidence text `winning_evidence` | Push, then **Dispute −$850.00**, then (when it closes as won) **Dispute won +$850.00**. Status back to **paid**. Owed $0. |
| 5 Refund + dispute | — | Not reproducible in the sandbox: `0259` disputes at payment, and a disputed charge can't be refunded. Covered by the local Postgres run (paid stays 200, owed 650). | — |

Preview logs (Vercel → the deployment → Functions), one line per event:

```
stripe connect webhook: charge.refunded evt_… refund re_… recorded −850
stripe connect webhook: refund.created  evt_… refund re_… duplicate — no-op
stripe connect webhook: charge.dispute.created evt_… du_… status=needs_response; push 1 device(s)
stripe connect webhook: charge.dispute.funds_withdrawn evt_… dispute_withdrawn du_… recorded -850
stripe connect webhook: charge.dispute.funds_reinstated evt_… dispute_reinstated du_… recorded 850
```

## 5. Retry check (idempotency)

Sandbox Dashboard → Workbench → Events → open one `charge.refunded` and one
`charge.dispute.funds_withdrawn` → **Resend** to the destination. Expect 200,
`duplicate — no-op` in the log, no new history row, no second push.

Read-only check (SQL Editor, test seller's id from step 2.4):

```sql
select entry_type, amount, stripe_object_id, paid_at
from public.invoice_payments
where user_id = '<test seller id>'
order by paid_at;

select invoice_number, status, amount_paid, refunded_amount, total - amount_paid as owed
from public.invoices
where user_id = '<test seller id>' and deleted_at is null
order by invoice_number;
```

Each `re_` / `du_` id appears once per entry type.

## 6. Afterwards

- Leave the test seller in place for future Connect tests. Never sign it in
  on production (its `acct_` id is sandbox-only; production's status calls
  would fail, read-only).
- Soft-delete the test invoices if they clutter anything. The ledger rows go
  with them from every reader.

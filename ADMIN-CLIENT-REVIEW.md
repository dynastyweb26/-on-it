# Admin client review — the chat-reachable routes

Scope: the routes named in `TOOL-AUDIT.md` §F1 that the chat flow can reach and
that use `adminClient()` (`src/lib/supabase/admin.ts`). No code changed for this
review. For each route: why the service role is there today, and whether an RLS
policy or a restricted RPC could replace it.

The risk is blast radius, not a known bypass: every route below authenticates
first and scopes its queries by the session user id. But a service-role query is
not contained by RLS, so one ownership-check mistake is a cross-account bug.

---

## 1. `GET` / `POST /api/zelle`

**Why it needs it.** The Zelle handle is stored encrypted. `get_zelle` and
`set_zelle` are SQL functions revoked from `anon` and `authenticated` and granted
to `service_role` only, and the encryption key is passed in from the server env
(`ZELLE_ENC_KEY`). The route takes the user from the session and passes
`p_user = user.id`, so the call itself is correctly scoped.

**Can RLS or a restricted RPC replace it?** Partly, and this is the strongest
candidate of the five. The service role is only a courier for two function calls,
not a query surface. A `SECURITY DEFINER` function that derives the owner from
`auth.uid()` (instead of taking `p_user`) and is granted to `authenticated` would
remove the admin client entirely. The blocker is the key: a definer function
cannot read `process.env`. That means moving the key to Supabase Vault (or
`pgsodium`) inside the database. Until then, the admin client stays, and the
mitigation is that the functions themselves are the authorization boundary.

**Recommendation:** replace with a Vault-backed `SECURITY DEFINER` RPC pair. Do
it as its own change: it touches migration, key custody and the settings screen.

---

## 2. `POST /api/invoices/[id]/send`

**Why it needs it.** The route writes `invoices` (status, `sent_at`, a render
snapshot built from the owner's `profiles` row and terms) with a conditional
update so a draft→sent transition cannot race a payment. It reads the invoice, the
profile and the terms, then updates with `.eq('user_id', user.id)` and
`.is('deleted_at', null)`.

**Can RLS or a restricted RPC replace it?** Yes. Every read is the caller's own
row, and `invoices` already has owner-scoped RLS. The two reasons to reach for
admin were (a) one atomic conditional update and (b) reading the profile/terms in
the same transaction-ish step. A `SECURITY INVOKER` RPC that takes the id and the
snapshot fields and performs the conditional update in SQL would run under the
caller's session with RLS in force. That is a net win: the ownership check moves
from application code into the database.

**Recommendation:** replaceable. Keep the route, swap the admin client for the
session client plus an RPC for the conditional transition.

---

## 3. `POST /api/estimates/[id]/send`

**Why it needs it.** Same shape as the invoice send, plus `hasConverted()` in
`src/lib/estimates/owner.ts`, which is the one genuinely wider lookup: it asks
whether the estimate already has a conversion invoice. That helper uses the
service role too.

**Can RLS or a restricted RPC replace it?** Yes, with one caveat. The estimate
read and update are owner-scoped and fine under RLS. `hasConverted` is a
cross-row existence check on rows that also belong to the caller, so a session
read of `invoices.finalize_key = convert-<id>` covers it — as long as the RLS
policy on `invoices` lets the owner see their own conversion invoice (it does).
A `SECURITY INVOKER` RPC can do the check and the conditional update in one call.

**Recommendation:** replaceable, same change as item 2. Do both routes together.

---

## 4. `POST` / `DELETE /api/push/subscribe`

**Why it needs it.** `push_subscriptions` has a unique key on `endpoint`, and one
physical device moves between accounts: when a second account signs in on the
same phone, the row must be reassigned from the previous owner. RLS cannot allow
that — an `UPDATE` policy that lets a user modify somebody else's row is exactly
the hole RLS exists to prevent. The route upserts on `endpoint` and assigns
`user_id` from the session, never from the body, and `DELETE` is scoped to
`.eq('user_id', user.id)`.

**Can RLS or a restricted RPC replace it?** An RLS policy cannot, by design: the
operation is an authorization change on a row the caller does not own. A
restricted `SECURITY DEFINER` RPC could (`claim_push_subscription(endpoint,
p256dh, auth)`), because it would enforce the one rule that matters — the caller
becomes the owner of that endpoint and nothing else changes. That is a real
reduction in blast radius: the definer function touches one table and one row
shape.

**Recommendation:** RPC-replaceable; keep the admin client until it exists. This
one is lower priority because the write is narrow and has no read surface.

---

## 5. `POST /api/feedback`

**Why it needs it.** The `feedback` table deliberately has no client `INSERT`
grant (migration `20261017000000_feedback.sql`) so a browser cannot spam rows
that also email the founder. The route writes the row with the service role, then
sends the notification email with Resend, with `Reply-To` set to the user.

**Can RLS or a restricted RPC replace it?** The row write, yes: an `INSERT`
policy `with check (auth.uid() = user_id)` on `feedback` (granting insert to
`authenticated`) would replace the admin insert, and the existing read-own policy
already exists. The email is not a database concern and stays in the route, which
already rate-limits. The reason the original design chose no client insert was
abuse, not authorization — a rate limit plus the insert-own policy covers that
without the service role.

**Recommendation:** replaceable for the insert. The email path is unchanged.

---

## Out of scope but adjacent

`src/app/api/income/route.ts` and `src/lib/events-server.ts` also use
`adminClient()` (the latter for public document-view events). Neither is on a
chat-originated path today, so they were not reviewed here. They belong in the
same access-control pass as the five above.

## Suggested order

1. Invoice and estimate send → session client plus one conditional-update RPC
   (removes the largest blast radius: the money-document write paths).
2. Feedback insert → insert-own policy; keep the email in the route.
3. Push subscribe → narrow `SECURITY DEFINER` RPC.
4. Zelle → Vault-backed definer RPC; the largest change, the smallest surface.

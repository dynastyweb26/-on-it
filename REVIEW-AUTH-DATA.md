# Read-Only Security & Data Audit Report: Auth & Data Integrity

**Target Repository:** `dynastyweb26/-on-it`
**Audit Date:** September 17, 2026
**Scope:** Access checks, API route authentication & input validation, Supabase Row-Level Security (RLS) policies, `SECURITY DEFINER` database functions, Environment variables & bundle exposure, and Account deletion completeness.

---

## Executive Summary

A comprehensive security, access control, and data integrity audit was conducted across the codebase. Overall, the application exhibits strong security architecture:
- Refresh-only middleware (`src/middleware.ts`) avoids dropped cookies and authentication redirect loops.
- Every protected page in `src/app/(app)` enforces client-side sign-out checks before displaying user data.
- API routes enforce authentication, rate-limiting, and schema validation with Zod.
- Sensitive environment variables are kept strictly on the server and isolated from browser bundles.
- Database functions marked `SECURITY DEFINER` consistently pin `search_path` and restrict `EXECUTE` privileges.

However, three significant findings were identified in database constraints and RLS policies:
1. **[P1] Account Deletion FK Constraint Failure**: Deleting an account fails with a Postgres foreign key violation if the user has recorded invoice payments.
2. **[P1] Unprotected Financial Fields on Sent Invoices**: Direct REST API updates can alter monetary totals and status on non-draft invoices.
3. **[P2] Hard DELETE Permitted on Soft-Deleted Tables**: RLS policies for `invoices` and `expenses` allow direct SQL `DELETE` operations despite application soft-deletion logic.

---

## Summary of Findings

| ID | Area | Severity | Title | Status / Confidence |
|---|---|---|---|---|
| **FINDING-1** | Account Deletion | **P1** | Account deletion fails with foreign key violation on `invoice_payments.user_id` | Confirmed |
| **FINDING-2** | Supabase RLS | **P1** | Sent and paid invoice financial fields, status, and client data are not protected from direct REST modification | Confirmed |
| **FINDING-3** | Supabase RLS | **P2** | `invoices` and `expenses` Row-Level Security policies permit hard `DELETE` despite soft-deletion architecture | Confirmed |

---

## Detailed Findings

### FINDING-1 [P1]: Account deletion fails with foreign key constraint violation on `invoice_payments.user_id`

- **Severity:** P1
- **File:Line:** `supabase/migrations/20260918000000_invoice_payments.sql:5` and `src/app/api/delete-account/route.ts:133`
- **What goes wrong and how someone would hit it:**
  When a user with recorded invoice payments attempts to delete their account from Settings, `POST /api/delete-account` executes `admin.auth.admin.deleteUser(user.id)`. In `20260918000000_invoice_payments.sql`, table `public.invoice_payments` defines `user_id` as `user_id uuid not null references auth.users(id)` without `ON DELETE CASCADE`. When PostgreSQL attempts to delete the `auth.users` row, the missing cascade on `invoice_payments_user_id_fkey` causes Postgres to throw foreign key violation error `23503`. As a result, account deletion crashes with HTTP 500 ("We couldn't finish deleting your account"), leaving the user's account and data intact.
- **Evidence:**
  `supabase/migrations/20260918000000_invoice_payments.sql:1-7`:
  ```sql
  create table if not exists public.invoice_payments (
    id uuid primary key default gen_random_uuid(),
    invoice_id uuid not null references public.invoices(id) on delete cascade,
    user_id uuid not null references auth.users(id),
    amount numeric(12,2) not null check (amount > 0),
    ...
  ```
  `src/app/api/delete-account/route.ts:133`:
  ```ts
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  ```
- **Confidence:** Confirmed
- **Suggested Fix:**
  Update the foreign key constraint on `public.invoice_payments.user_id` to include `ON DELETE CASCADE`:
  ```sql
  alter table public.invoice_payments
    drop constraint if exists invoice_payments_user_id_fkey,
    add constraint invoice_payments_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  ```
  Alternatively, explicitly delete the user's `invoice_payments` rows in `src/app/api/delete-account/route.ts` prior to deleting the user.

---

### FINDING-2 [P1]: Sent and paid invoice financial fields, status, and client data are not protected from direct REST modification

- **Severity:** P1
- **File:Line:** `supabase/migrations/20260826232448_draft_line_items_editable.sql:24` and `supabase/migrations/20260825120000_quote_numbering_and_document_lock.sql:85`
- **What goes wrong and how someone would hit it:**
  Once an invoice leaves `'draft'` status (`status = 'sent'`, `'paid'`, `'overdue'`, or `'void'`), application business logic expects its financial totals, client details, and status to be locked. However, database triggers only protect a subset of columns:
  - `lock_document_identity()` pins `invoice_number` and `kind`.
  - `lock_line_items()` pins `line_items` if `OLD.status != 'draft'`.
  - `lock_deposit_terms()` pins `deposit_type` and `deposit_value` if `OLD.amount_paid > 0`.

  Columns including `subtotal`, `tax_rate`, `tax_amount`, `total`, `client_name`, `client_address`, `client_phone`, `notes`, `status`, `due_date`, `sent_at`, and `paid_at` remain completely unprotected by triggers or column-level permissions. An authenticated user (or malicious actor using a user JWT) can issue a direct PostgREST `PATCH /rest/v1/invoices?id=eq.<id>` request to change `total` to `$0` or alter `status` on a sent/paid invoice, corrupting accounting records and bypassing document locking.
- **Evidence:**
  `supabase/migrations/20260826232448_draft_line_items_editable.sql:24-32`:
  ```sql
  create or replace function public.lock_line_items()
  returns trigger language plpgsql as $$
  begin
    if OLD.status = 'draft' then return NEW; end if;
    NEW.line_items := OLD.line_items;
    return NEW;
  end $$;
  ```
  No trigger or policy prevents updating `total`, `subtotal`, `tax_rate`, `tax_amount`, `client_name`, `status`, etc., when `OLD.status != 'draft'`.
- **Confidence:** Confirmed
- **Suggested Fix:**
  Implement a `BEFORE UPDATE` trigger function on `public.invoices` that pins all core document fields when `OLD.status != 'draft'`:
  ```sql
  create or replace function public.lock_sent_invoice_fields()
  returns trigger language plpgsql as $$
  begin
    if OLD.status != 'draft' then
      NEW.client_name    := OLD.client_name;
      NEW.client_address := OLD.client_address;
      NEW.client_phone   := OLD.client_phone;
      NEW.subtotal       := OLD.subtotal;
      NEW.tax_rate       := OLD.tax_rate;
      NEW.tax_amount     := OLD.tax_amount;
      NEW.total          := OLD.total;
      NEW.notes          := OLD.notes;
      NEW.due_date       := OLD.due_date;
      NEW.sent_at        := OLD.sent_at;
    end if;
    return NEW;
  end $$;
  ```

---

### FINDING-3 [P2]: `invoices` and `expenses` Row-Level Security policies permit hard `DELETE` despite soft-deletion architecture

- **Severity:** P2
- **File:Line:** `supabase/migrations/20260905000000_soft_delete.sql:21`
- **What goes wrong and how someone would hit it:**
  Invoices and expenses are soft-deleted in the application by setting `deleted_at = now()` so they can be restored or properly filtered in vault/summary views. However, the RLS policies `"own invoices"` and `"own expenses"` use `FOR ALL USING (auth.uid() = user_id)`, which grants full SQL `DELETE` permissions to the owner. An authenticated client can issue a direct PostgREST `DELETE /rest/v1/invoices?id=eq.<id>` or `DELETE /rest/v1/expenses?id=eq.<id>` call, hard-deleting database records and bypassing soft-deletion and undo capabilities.
- **Evidence:**
  `supabase/migrations/20260905000000_soft_delete.sql:21-28`:
  ```sql
  drop policy if exists "own invoices" on public.invoices;
  create policy "own invoices" on public.invoices
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

  drop policy if exists "own expenses" on public.expenses;
  create policy "own expenses" on public.expenses
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```
- **Confidence:** Confirmed
- **Suggested Fix:**
  Split the `FOR ALL` policy into explicit policies for `SELECT`, `INSERT`, and `UPDATE` only, omitting `FOR DELETE` (or revoking `DELETE` on `invoices` and `expenses` for `authenticated` and `anon` roles):
  ```sql
  drop policy if exists "own invoices" on public.invoices;
  create policy "own invoices select" on public.invoices for select using (auth.uid() = user_id);
  create policy "own invoices insert" on public.invoices for insert with check (auth.uid() = user_id);
  create policy "own invoices update" on public.invoices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```

---

## Area-by-Area Review

### 1. Access Checks (`src/app/(app)`)

- **Middleware:** `src/middleware.ts` implements the `@supabase/ssr` refresh-only session update pattern. It intentionally performs no redirects, ensuring session cookies always ride the returned response to prevent cookie dropping and login redirect loops.
- **Page Guards:** Each protected page under `src/app/(app)` performs a client-side authentication check using `supabase.auth.getSession()` and `supabase.auth.getUser()`, redirecting unauthenticated users to `/login`.
- **Page Inventory & Verification:**

| Route | File Path | Auth Guard Present? | Details |
|---|---|---|---|
| `/chat` | `src/app/(app)/chat/page.tsx` | N/A (Intentionally Open) | Open to guests by design (5 free parses, voice demo). Gated actions (finalize/receipt save) prompt for auth. |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login`. |
| `/expenses` | `src/app/(app)/expenses/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login`. |
| `/invoices` | `src/app/(app)/invoices/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login`. |
| `/invoices/[id]` | `src/app/(app)/invoices/[id]/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login`. |
| `/settings` | `src/app/(app)/settings/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login` with an 8s stall timeout. |
| `/summary` | `src/app/(app)/summary/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login`. |
| `/vault` | `src/app/(app)/vault/page.tsx` | **Yes** | Checks `session` and `user`; redirects signed-out users to `/login`. |

- **Status:** **no finding**

---

### 2. API Routes (`src/app/api`)

Every API route under `src/app/api` was audited for caller authentication/authorization, rate limiting, and request body validation/sanitization.

| Route Handler | File Path | Authentication & Authorization | Input Validation & Rate Limiting | Status |
|---|---|---|---|---|
| `GET /api/access` | `src/app/api/access/route.ts` | `getUser()`; returns 401 if unauthenticated. | Read-only GET endpoint; calls server-side `hasAccess()`. | Clean |
| `POST /api/billing-portal` | `src/app/api/billing-portal/route.ts` | `getUser()`; returns 401 if unauthenticated. | Rate limited (`billing_portal`); no request body needed. | Clean |
| `POST /api/checkout` | `src/app/api/checkout/route.ts` | `getUser()`; returns 401 if unauthenticated. | Rate limited (`checkout`); body validated with Zod (`z.object({}).nullish()`). | Clean |
| `POST /api/delete-account` | `src/app/api/delete-account/route.ts` | `getUser()`; returns 401 if unauthenticated. | Rate limited (`delete_account`); body validated with Zod (`z.object({ confirm: z.literal('DELETE') })`). | Clean |
| `GET /api/followups` | `src/app/api/followups/route.ts` | Cron target; auth verified via `verifyCronAuth(req)` (`Authorization: Bearer CRON_SECRET`). Returns 401 if invalid. | Read-only cron execution. | Clean |
| `POST /api/parse` | `src/app/api/parse/route.ts` | Deferred auth: 5 free parses for guests via `onit_guest` cookie, then returns 401 (`authRequired`). Checks `getUser()`. | Rate limited (`parse`); body validated with Zod `ParseBody` (`history` bounded to 50 items, content <= 4000; `draft` <= 8000). Sanitizes user input (`sanitizeForAI`). | Clean |
| `POST /api/parse-receipt` | `src/app/api/parse-receipt/route.ts` | `getUser()`; returns 401 if unauthenticated. | Rate limited (`parse_receipt`); checks multipart file size (<= 2MB) and MIME type. Validates model JSON response with Zod `VisionResult` and sanitizes `vendor`. | Clean |
| `POST /api/transcribe` | `src/app/api/transcribe/route.ts` | Deferred auth: guest quota (6 via `onit_guest_tx` cookie) + daily guest ceiling `reserveGuestDaily`; signed-in daily ceiling `reserveUserDaily`. | Rate limited (`transcribe`); validates audio buffer size (0 < size <= 10MB). | Clean |
| `GET /api/trial-reminders` | `src/app/api/trial-reminders/route.ts` | Cron target; auth verified via `verifyCronAuth(req)`. Returns 401 if invalid. | Read-only cron execution; dormant-safe. | Clean |
| `POST /api/webhooks/stripe` | `src/app/api/webhooks/stripe/route.ts` | Stripe webhook target; signature verified against raw text body using `STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEventAsync`. Returns 400 if invalid. | Event constructed strictly via Stripe SDK. | Clean |
| `GET`/`POST /api/zelle` | `src/app/api/zelle/route.ts` | `requireUser()` (`getUser()`); returns 401 if unauthenticated. | Rate limited (`zelle_read`/`zelle_write`); GET searchParams checked; POST body validated with Zod `ZelleBody` and sanitized (`sanitizeField`). | Clean |

- **Status:** **no finding**

---

### 3. Supabase Row-Level Policies

All tables and Storage buckets were reviewed for owner scoping, soft-deletion handling, and column mutability.

- **Table Scope Overview:**
  - `public.profiles`: Scoped to owner (`id = auth.uid()`). Table-level UPDATE revoked from `authenticated` in migration `20260723130946` and re-granted on specific user-editable columns only.
  - `public.clients`: Scoped to owner (`user_id = auth.uid()`).
  - `public.vault_documents`: Scoped to owner (`user_id = auth.uid()`).
  - `public.push_subscriptions`: Scoped to owner (`user_id = auth.uid()`).
  - `public.invoice_payments`: Scoped to owner (`user_id = auth.uid()`).
  - `public.rate_limits`: RLS enabled, no public/authenticated policies (service role only).
  - `public.audit_log`: RLS enabled, no public/authenticated policies (service role only).
  - `public.access_grants`: RLS enabled, no public/authenticated policies (accessed via SECURITY DEFINER `redeem_grant` function).
  - Storage Buckets (`vault`, `receipts`, `logos`): Folder-scoped to `(storage.foldername(name))[1] = auth.uid()::text`.
- **Soft Delete & Column Mutability Findings:**
  - **FINDING-2 [P1]**: Sent/paid invoice financial totals and status are not protected from direct REST modification.
  - **FINDING-3 [P2]**: `invoices` and `expenses` RLS policies permit hard `DELETE` despite soft-deletion architecture.

---

### 4. Database Functions Marked SECURITY DEFINER

All 13 `SECURITY DEFINER` functions across `supabase/migrations/` were audited for `search_path` pinning and narrow execution grants.

| Function Name | Migration File | `search_path` Pinned? | Execution Grants | Status |
|---|---|---|---|---|
| `log_audit()` | `001_init.sql` / `20260731000000` | `set search_path = public` | Internal trigger function | Clean |
| `next_invoice_no(p_user uuid)` | `001_init.sql` | `set search_path = public` | Checks `id = auth.uid()` | Clean |
| `set_zelle(p_user, p_value, p_key)` | `001_init.sql` | `set search_path = public, extensions` | Revoked from `anon`, `authenticated` | Clean |
| `get_zelle(p_user, p_key)` | `001_init.sql` | `set search_path = public, extensions` | Revoked from `anon`, `authenticated` | Clean |
| `redeem_grant(p_token)` | `002_access_grants.sql` | `set search_path = public` | Revoked from `anon`, granted to `authenticated` | Clean |
| `set_referral_code()` | `004_user_referrals.sql` | `set search_path = public` | Internal trigger function | Clean |
| `redeem_referral(p_token)` | `004_user_referrals.sql` | `set search_path = public` | Revoked from `anon`, granted to `authenticated` | Clean |
| `enforce_free_invoice_limit()` | `20260724154509` | `set search_path = public` | Internal trigger function | Clean |
| `assign_document_number()` | `20260825120000` | `set search_path = public` | Internal trigger function | Clean |
| `set_invoice_token()` | `20260901120000` | `set search_path = public` | Internal trigger function | Clean |
| `get_public_invoice(p_token, p_key)` | `20260918000004` | `set search_path = ''` | Revoked from `public`, `anon`, `authenticated`; granted to `service_role` | Clean |
| `reconcile_invoice_from_ledger(uuid)` | `20260918000003` | `set search_path = public` | Revoked from `public`, `anon`, `authenticated` | Clean |
| `sync_invoice_amount_paid()` | `20260918000000` / `20260918000003` | `set search_path = public` | Internal trigger function | Clean |

- **Status:** **no finding**

---

### 5. Environment Variables

All `NEXT_PUBLIC_` environment variables and client-side imports were audited for credential leakage or sensitive exposure.

- **`NEXT_PUBLIC_` Variables:**
  - `NEXT_PUBLIC_SUPABASE_URL`: Public Supabase endpoint.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase anon key (protected by RLS).
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Web Push public key.
  - `NEXT_PUBLIC_APP_URL`: Canonical web application origin URL.
  - `NEXT_PUBLIC_PAYWALL_ENABLED`: Feature flag for paywall UI gating.
  - `NEXT_PUBLIC_TRACE` / `NEXT_PUBLIC_TRACE_VERBOSE`: Development/debug turn tracing flags (PII redacted by default).
- **Secret Isolation:**
  - All sensitive secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `ASSEMBLYAI_API_KEY`, `ZELLE_ENC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`) omit the `NEXT_PUBLIC_` prefix and are imported exclusively in server-side API handlers (`src/app/api/...`) or server utilities (`src/lib/supabase/admin.ts`, `src/lib/stripe/server.ts`, `src/lib/email/resend.ts`, `src/lib/ai.ts`, `src/lib/ratelimit.ts`).
  - No server secrets or admin clients are reachable in browser bundles.

- **Status:** **no finding**

---

### 6. Account Deletion

Account deletion was audited across `src/app/api/delete-account/route.ts`, local client storage clearing, and database cascading rules.

- **Removal Verification:**
  - **Stripe Subscriptions:** Cancels all active/trialing/past_due subscriptions via `stripe.subscriptions.cancel(sub.id)`. Retains customer object for billing history.
  - **Storage Files:** Clears all files under `${userId}/` across `vault`, `logos`, and `receipts` storage buckets.
  - **Audit Log:** Redacts historical user activity payloads to `{ redacted: true }`.
  - **Local Storage:** `clearAllChatStorage(userId)` removes both current conversation and history keys.
  - **Database Records:** Deletes `auth.users(id)`. Foreign keys cascade deletion from `profiles` to `clients`, `invoices`, `expenses`, `vault_documents`, and `push_subscriptions`.
- **Database Cascade Defect:**
  - **FINDING-1 [P1]**: `public.invoice_payments` missing `ON DELETE CASCADE` on `user_id` causes `admin.auth.admin.deleteUser(user.id)` to fail with Postgres error `23503` when deleting accounts with payment history.

- **Status:** **1 finding (FINDING-1)**

---

## Conclusion & Recommended Action Plan

To ensure data integrity, privacy compliance, and document security, the following fixes are recommended for implementation:

1. **Fix FINDING-1 (Account Deletion FK):** Apply a SQL migration adding `ON DELETE CASCADE` to `public.invoice_payments.user_id`.
2. **Fix FINDING-2 (Sent Invoice Locking):** Add a `BEFORE UPDATE` trigger on `public.invoices` locking core financial fields when `OLD.status != 'draft'`.
3. **Fix FINDING-3 (Soft Delete RLS):** Restrict RLS policies on `invoices` and `expenses` to `SELECT`, `INSERT`, and `UPDATE` only.

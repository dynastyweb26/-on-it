-- ═══════════════════════════════════════════════════════════════
-- Recurring expenses (UI redesign merge 3 · 3·1, UI-REDESIGN-AUDIT §3 D).
--
--   1. public.recurring_expenses — one row per repeating charge: vendor,
--      amount, category (the 10 expense categories, Q5), cadence weekly /
--      monthly / yearly, anchor_day (monthly / yearly day of month; 31 =
--      the month's last day), next_on, auto_log ("Log automatically"; off =
--      paused, L3). last_logged_on / last_skipped_on / last_skip_reason are
--      written only by the service-role cron (merge 3 · 3·5). Delete is soft
--      (deleted_at, "Stop & delete"); expenses already logged stay. One live
--      item per owner per vendor per cadence.
--   2. RLS: owner select / insert / update. No DELETE policy or grant. anon
--      gets nothing. authenticated: SELECT; INSERT and UPDATE on the user
--      columns only (never last_*). service_role (the cron): select / insert /
--      update, stated explicitly.
--   3. expenses.recurring_id → recurring_expenses (on delete set null) plus a
--      unique (recurring_id, spent_on) index: one logged row per item per due
--      date, which makes the cron idempotent. A soft-deleted logged row still
--      holds its slot, so deleting it never brings it back.
--   4. expenses grants move to column lists so a client can never set
--      recurring_id (a forged "Recurring" row). INSERT: user_id, description,
--      amount, category, spent_on, vendor, note, receipt_url, receipt_hash —
--      every column the app writes (chat, receipt, Books sheet, on main and
--      feat/ui-redesign). UPDATE: description, amount, category, spent_on,
--      vendor, note, deleted_at. anon loses its default grants; authenticated
--      loses DELETE / TRIGGER / REFERENCES (RLS already denied them).
--      created_at / updated_at stay trigger-owned (cap trigger, touch).
--   5. repeat_candidate(p_expense uuid) — the "Make it recurring?" check
--      (§1.5): the caller's expense, not itself auto-logged, whose most recent
--      earlier same-vendor (case-insensitive) expense within ±10 % is a
--      cadence gap ago (weekly 5–9 d, monthly 26–35 d, yearly 350–380 d),
--      with no live recurring item for that vendor. security invoker; EXECUTE
--      to authenticated only.
--   6. notification_log_type_chk gains 'recurring_skipped' (the cron's
--      "Couldn't log Rent, free limit reached" push).
--
-- The free expense cap (enforce_free_expense_limit, BEFORE INSERT, security
-- definer) is untouched and still fires on the cron's service-role inserts:
-- the cap is never bypassed (F6 / L3).
--
-- Sorts before 20261005000000_payment_reversals (fix/disputes-refunds, not
-- applied), so that file can still be pushed later without --include-all.
-- Idempotent. Verify after pushing: npm run db:privcheck — section T.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── recurring_expenses ───────────────────────────────────────────
create table if not exists public.recurring_expenses (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  vendor            text not null,
  vendor_key        text generated always as (lower(btrim(vendor))) stored,
  description       text,
  amount            numeric(12,2) not null,
  category          text not null default 'other',
  cadence           text not null,
  anchor_day        smallint,
  next_on           date not null,
  auto_log          boolean not null default true,
  last_logged_on    date,
  last_skipped_on   date,
  last_skip_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint recurring_expenses_vendor_chk check (char_length(btrim(vendor)) between 1 and 120),
  constraint recurring_expenses_description_chk check (description is null or char_length(description) <= 200),
  constraint recurring_expenses_amount_chk check (amount > 0 and amount <= 10000000),
  constraint recurring_expenses_category_chk check (category in
    ('food', 'fuel', 'supplies', 'tools', 'travel', 'maintenance', 'subscriptions', 'phone', 'insurance', 'other')),
  constraint recurring_expenses_cadence_chk check (cadence in ('weekly', 'monthly', 'yearly')),
  constraint recurring_expenses_anchor_chk check (anchor_day is null or anchor_day between 1 and 31),
  constraint recurring_expenses_skip_reason_chk check (last_skip_reason is null or last_skip_reason in ('free_limit', 'error'))
);

-- One live item per owner per vendor per cadence.
create unique index if not exists recurring_expenses_user_vendor_cadence_idx
  on public.recurring_expenses (user_id, vendor_key, cadence)
  where deleted_at is null;
-- The cron's scan: live, auto-logging items by due date.
create index if not exists recurring_expenses_due_idx
  on public.recurring_expenses (next_on)
  where deleted_at is null and auto_log;

drop trigger if exists touch_recurring_expenses on public.recurring_expenses;
create trigger touch_recurring_expenses before update on public.recurring_expenses
  for each row execute function public.touch_updated_at();

-- 2 ── RLS + grants ─────────────────────────────────────────────────
alter table public.recurring_expenses enable row level security;
drop policy if exists "own recurring expenses select" on public.recurring_expenses;
drop policy if exists "own recurring expenses insert" on public.recurring_expenses;
drop policy if exists "own recurring expenses update" on public.recurring_expenses;
create policy "own recurring expenses select" on public.recurring_expenses
  for select using (auth.uid() = user_id);
create policy "own recurring expenses insert" on public.recurring_expenses
  for insert with check (auth.uid() = user_id);
create policy "own recurring expenses update" on public.recurring_expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on table public.recurring_expenses from anon, authenticated;
grant select on table public.recurring_expenses to authenticated;
grant insert (user_id, vendor, description, amount, category, cadence, anchor_day, next_on, auto_log)
  on table public.recurring_expenses to authenticated;
grant update (vendor, description, amount, category, cadence, anchor_day, next_on, auto_log, deleted_at)
  on table public.recurring_expenses to authenticated;
-- The cron (service role) reads items, stamps last_* and advances next_on.
-- Supabase's default privileges already give it this; stated, not assumed.
grant select, insert, update on table public.recurring_expenses to service_role;

-- 3 ── expenses.recurring_id ────────────────────────────────────────
alter table public.expenses
  add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;

-- Not partial: NULLs are distinct, so ordinary expenses (recurring_id null)
-- never collide, and the cron's upsert (ON CONFLICT (recurring_id, spent_on),
-- no WHERE — what PostgREST sends) can infer it.
create unique index if not exists expenses_recurring_due_idx
  on public.expenses (recurring_id, spent_on);
-- repeat_candidate's lookup: the owner's live expenses by vendor, newest first.
create index if not exists expenses_user_vendor_idx
  on public.expenses (user_id, lower(btrim(vendor)), spent_on desc)
  where deleted_at is null;

-- 4 ── expenses grants: column lists ────────────────────────────────
revoke all on table public.expenses from anon;
revoke insert, update, delete, truncate, references, trigger on table public.expenses from authenticated;
grant select on table public.expenses to authenticated;
grant insert (user_id, description, amount, category, spent_on, vendor, note, receipt_url, receipt_hash)
  on table public.expenses to authenticated;
grant update (description, amount, category, spent_on, vendor, note, deleted_at)
  on table public.expenses to authenticated;

-- 5 ── repeat_candidate ─────────────────────────────────────────────
create or replace function public.repeat_candidate(p_expense uuid)
returns table (vendor text, amount numeric, cadence text, prior_on date)
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select x.id, x.user_id, btrim(x.vendor) as vendor, lower(btrim(x.vendor)) as vkey, x.amount, x.spent_on
    from public.expenses x
    where x.id = p_expense
      and x.user_id = auth.uid()
      and x.deleted_at is null
      and x.recurring_id is null
      and x.vendor is not null and btrim(x.vendor) <> ''
  ),
  -- The most recent earlier expense from the same vendor at a similar amount.
  prior as (
    select e.*, p.spent_on as prior_on
    from e
    cross join lateral (
      select y.spent_on
      from public.expenses y
      where y.user_id = e.user_id
        and y.id <> e.id
        and y.deleted_at is null
        and lower(btrim(y.vendor)) = e.vkey
        and e.amount between y.amount * 0.9 and y.amount * 1.1  -- within ±10 % of the earlier charge
        and y.spent_on < e.spent_on
      order by y.spent_on desc
      limit 1
    ) p
  )
  select pr.vendor, pr.amount,
    case
      when pr.spent_on - pr.prior_on between 5 and 9 then 'weekly'
      when pr.spent_on - pr.prior_on between 26 and 35 then 'monthly'
      when pr.spent_on - pr.prior_on between 350 and 380 then 'yearly'
    end,
    pr.prior_on
  from prior pr
  where (pr.spent_on - pr.prior_on between 5 and 9
      or pr.spent_on - pr.prior_on between 26 and 35
      or pr.spent_on - pr.prior_on between 350 and 380)
    and not exists (
      select 1 from public.recurring_expenses r
      where r.user_id = pr.user_id and r.vendor_key = pr.vkey and r.deleted_at is null
    );
$$;

revoke execute on function public.repeat_candidate(uuid) from public, anon;
grant execute on function public.repeat_candidate(uuid) to authenticated;

-- 6 ── notification_log: allow the new event type ───────────────────
-- Full list, superseding 20261001000010's (which added recap).
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in ('payment_received', 'connect_problem', 'invoice_viewed', 'draft_unsent', 'recap', 'recurring_skipped', 'test'));

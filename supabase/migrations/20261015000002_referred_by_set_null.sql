-- ═══════════════════════════════════════════════════════════════
-- M3 — Add ON DELETE SET NULL to profiles.referred_by FK
--
-- Root cause: 004_user_referrals.sql added referred_by with no
-- on-delete action, defaulting to RESTRICT. If an account-delete
-- hits this FK before the referrer's profile row is gone, it raises
-- 23503 and leaves the user half-deleted (Stripe cancelled, Storage
-- cleared, but auth row still alive). Postgres's delete-account
-- route already handles cascade via profiles → auth.users, but a
-- peer-row block (referrer still exists) fires before that.
--
-- Fix: drop and re-add the constraint with ON DELETE SET NULL.
-- Referred records keep their history; the referrer column just
-- becomes null if the referrer ever deletes their account.
--
-- Idempotent: drop if exists guards the re-add.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  drop constraint if exists profiles_referred_by_fkey;

alter table public.profiles
  add constraint profiles_referred_by_fkey
    foreign key (referred_by)
    references public.profiles(id)
    on delete set null;

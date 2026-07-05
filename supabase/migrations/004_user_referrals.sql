-- ═══════════════════════════════════════════════════════════════
-- 004 — Per-user referral codes + referred_by attribution
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr).
-- Flow: /i/<code> sets the onit_grant cookie (existing route). At
-- onboarding, redeem_grant() is tried first (access_grants); if it
-- returns null the token is treated as a referral code and
-- redeem_referral() stamps referred_by on the new profile.
-- No credit/reward logic yet — that lands with Stripe.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles
  add column referral_code text unique
    check (referral_code is null or char_length(referral_code) between 6 and 8),
  add column referred_by uuid references public.profiles(id);

-- Short readable code: lowercase, no look-alike chars (0/o, 1/l/i)
create or replace function public.gen_referral_code() returns text
language plpgsql volatile as $$
declare
  chars constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..7 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from profiles where referral_code = code);
  end loop;
  return code;
end $$;
revoke execute on function public.gen_referral_code from anon, authenticated;

-- Every new profile gets a code automatically
create or replace function public.set_referral_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referral_code is null then
    new.referral_code := gen_referral_code();
  end if;
  return new;
end $$;
create trigger profiles_referral_code before insert on public.profiles
  for each row execute function public.set_referral_code();

-- Backfill existing rows
update public.profiles
  set referral_code = public.gen_referral_code()
  where referral_code is null;

-- Redeem: same pattern as redeem_grant (security definer, authenticated only).
-- Sets referred_by once; never overwrites; you cannot refer yourself.
create or replace function public.redeem_referral(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare ref_id uuid;
begin
  select id into ref_id from profiles where referral_code = lower(trim(p_token));
  if ref_id is null or ref_id = auth.uid() then return false; end if;
  update profiles set referred_by = ref_id
   where id = auth.uid() and referred_by is null;
  return found;
end $$;
revoke execute on function public.redeem_referral from anon;
grant execute on function public.redeem_referral to authenticated;

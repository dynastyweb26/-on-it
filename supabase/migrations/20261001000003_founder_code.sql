-- ═══════════════════════════════════════════════════════════════
-- Founder code "JesusisKing": server-only redemption, 25 max, once per user.
--
--   1. Seed the grant: token 'JesusisKing' (stored and matched EXACTLY —
--      case-sensitive, no lowercasing), access_tier 'founder', max_uses 25.
--      access_grants.max_uses / use_count are the redemption cap and count.
--   2. grant_redemptions(grant_id, user_id): one row per user per code, so the
--      same user can't redeem twice. RLS on, no policies, no client
--      privileges: nobody reads it except through the RPC.
--   3. redeem_grant_for(p_user_id, p_token) — SECURITY DEFINER, service_role
--      only. Called by POST /api/redeem (rate-limited, user id from the
--      session). Locks the grant row (FOR UPDATE), so concurrent redemptions
--      serialize and the cap can't be passed. Returns a status:
--        'ok'                — granted
--        'invalid'           — no such code (exact match), expired, or full
--                              (one answer for all three: reveals nothing)
--        'already_founder'   — the user already has founder access
--        'already_redeemed'  — this user already used this code
--        'no_profile'        — the user hasn't finished onboarding
--   4. redeem_grant(text) — the old client-callable RPC — loses client
--      EXECUTE. Codes are redeemed only through /api/redeem from now on, so
--      guessing can't bypass the route's rate limit.
--
-- access_grants itself is unchanged: RLS on, no policies, so clients can't
-- read the code strings or counts. access_tier stays column-locked on
-- profiles; only this SECURITY DEFINER function writes it here.
-- Idempotent. Verify after pushing: npm run db:privcheck (section O).
-- ═══════════════════════════════════════════════════════════════

-- 1 ── The code ─────────────────────────────────────────────────
insert into public.access_grants (token, label, access_tier, max_uses)
values ('JesusisKing', 'JesusisKing founder code', 'founder', 25)
on conflict (token) do nothing;

-- 2 ── One redemption per user per code ─────────────────────────
create table if not exists public.grant_redemptions (
  grant_id    uuid not null references public.access_grants(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (grant_id, user_id)
);

alter table public.grant_redemptions enable row level security;
revoke all on public.grant_redemptions from public, anon, authenticated;

-- 3 ── Server-only redemption ───────────────────────────────────
create or replace function public.redeem_grant_for(p_user_id uuid, p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  g      record;
  v_tier text;
begin
  if p_user_id is null or p_token is null
     or char_length(p_token) < 3 or char_length(p_token) > 40 then
    return 'invalid';
  end if;

  -- Lock the caller's profile first: one redemption at a time per user.
  select p.access_tier into v_tier
    from public.profiles p
    where p.id = p_user_id
    for update;
  if not found then
    return 'no_profile';
  end if;
  if v_tier = 'founder' then
    return 'already_founder';
  end if;

  -- Exact, case-sensitive match. FOR UPDATE serializes concurrent
  -- redemptions of the same code, so use_count can't pass max_uses.
  select * into g
    from public.access_grants a
    where a.token = p_token
    for update;
  if not found
     or (g.expires_at is not null and g.expires_at < now())
     or (g.max_uses is not null and g.use_count >= g.max_uses) then
    return 'invalid';
  end if;

  if exists (select 1 from public.grant_redemptions r
             where r.grant_id = g.id and r.user_id = p_user_id) then
    return 'already_redeemed';
  end if;

  insert into public.grant_redemptions (grant_id, user_id) values (g.id, p_user_id);
  update public.access_grants set use_count = use_count + 1 where id = g.id;
  update public.profiles
    set access_tier = g.access_tier, granted_via = g.token
    where id = p_user_id;
  return 'ok';
end $$;

revoke execute on function public.redeem_grant_for(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_grant_for(uuid, text) to service_role;

-- 4 ── The old client-callable RPC: no client access ────────────
revoke execute on function public.redeem_grant(text) from public, anon, authenticated;

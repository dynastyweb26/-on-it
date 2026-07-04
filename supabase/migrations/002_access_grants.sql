alter table public.profiles
  add column access_tier text not null default 'standard',
  add column granted_via text;

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (char_length(token) between 3 and 40),
  label text not null check (char_length(label) <= 200),
  access_tier text not null default 'founder',
  max_uses int,
  use_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.access_grants enable row level security;

create or replace function public.redeem_grant(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from access_grants where token = p_token for update;
  if g is null then return null; end if;
  if g.expires_at is not null and g.expires_at < now() then return null; end if;
  if g.max_uses is not null and g.use_count >= g.max_uses then return null; end if;
  update access_grants set use_count = use_count + 1 where id = g.id;
  update profiles set access_tier = g.access_tier, granted_via = g.token where id = auth.uid();
  return g.access_tier;
end $$;

revoke execute on function public.redeem_grant from anon;
grant execute on function public.redeem_grant to authenticated;

insert into access_grants (token, label, access_tier, max_uses)
  values ('dadcrew', 'Dad''s contractor network', 'founder', 50);
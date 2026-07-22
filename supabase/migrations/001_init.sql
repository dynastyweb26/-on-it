-- ═══════════════════════════════════════════════════════════════
-- ON IT — Initial schema
-- Run in Supabase SQL Editor (project: bitfmmffnigxjjyxoxfr)
-- Security layers implemented here:
--   1. RLS on every table (deny-by-default)
--   2. RBAC role column on top of RLS
--   3. Audit log table + triggers on sensitive tables
--   4. Per-user rate limiting table (Postgres-backed, same pattern as T-Vault)
--   5. Column-level encryption for payment handles (pgcrypto)
--   6. Service-role isolation (no anon grants on internal tables)
--   7. Input length constraints as a final backstop against injection payloads
--
-- Idempotent: every create is guarded (if not exists / or replace / drop-then-
-- create for policies) so a full replay against an empty DB — or a re-run — is
-- safe and produces the same schema.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Profiles (one per auth user, created on onboarding) ──────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 1 and 120),
  trade_type text check (char_length(trade_type) <= 60),
  logo_url text,
  website_url text check (website_url is null or website_url ~* '^https?://'),
  slogan text check (slogan is null or char_length(slogan) <= 140),
  -- Brand colors: user picks 2-3 from the 20-swatch palette
  brand_colors text[] not null default '{}',          -- hex values, 2-3 entries
  background_color text,                              -- which of brand_colors is the canvas
  invoice_template text not null default 'classic'
    check (invoice_template in ('classic','sidebar','industrial','friendly')),
  -- Payment display info — ENCRYPTED at rest (layer 5)
  zelle_info_enc bytea,
  paypal_me text check (paypal_me is null or char_length(paypal_me) <= 120),
  cashapp_tag text check (cashapp_tag is null or char_length(cashapp_tag) <= 60),
  -- RBAC (layer 2): 'owner' now; 'member' reserved for v1.1 teams
  role text not null default 'owner' check (role in ('owner','member','admin')),
  next_invoice_number int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Clients ──────────────────────────────────────────────────
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or char_length(email) <= 254),
  address text check (address is null or char_length(address) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ── Invoices (also stores quotes — kind column) ──────────────
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  kind text not null default 'invoice' check (kind in ('invoice','quote')),
  invoice_number int not null,
  client_name text not null,
  line_items jsonb not null default '[]',   -- [{description, qty, unit_price}]
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'draft'
    check (status in ('draft','sent','paid','overdue','void')),
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  last_nudge_at timestamptz,                -- for the 2-day follow-up engine
  converted_from uuid references public.invoices(id), -- quote → invoice trail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, invoice_number, kind)
);
create index if not exists invoices_user_status_idx on public.invoices (user_id, status);
create index if not exists invoices_nudge_idx on public.invoices (status, last_nudge_at)
  where status in ('sent','overdue');

-- ── Expenses ─────────────────────────────────────────────────
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 300),
  amount numeric(12,2) not null check (amount >= 0),
  category text check (category is null or char_length(category) <= 60),
  tax_deductible boolean not null default false,
  invoice_id uuid references public.invoices(id) on delete set null, -- job costing
  receipt_path text,                        -- storage path in 'vault' bucket
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists expenses_user_date_idx on public.expenses (user_id, spent_on desc);

-- ── The Vault (document archive metadata; files in Storage) ──
create table if not exists public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  doc_type text check (doc_type in ('invoice','quote','receipt','contract','photo','other')),
  storage_path text not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vault_user_idx on public.vault_documents (user_id, created_at desc);

-- ── Push subscriptions (2-day follow-up notifications) ───────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ── Rate limits (layer 4 — Postgres-backed, per user per route)
create table if not exists public.rate_limits (
  user_id uuid not null,
  route text not null,
  window_start timestamptz not null default now(),
  count int not null default 1,
  primary key (user_id, route)
);
-- No policies added → invisible to anon/authenticated. Service role only (layer 6).
alter table public.rate_limits enable row level security;

-- ── Audit log (layer 3) ──────────────────────────────────────
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  table_name text not null,
  action text not null,
  row_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
-- Service role only. Users never read/write audit rows directly.

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, table_name, action, row_id, detail)
  values (
    auth.uid(),
    tg_table_name,
    tg_op,
    coalesce(new.id, old.id),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end - 'zelle_info_enc'
  );
  return coalesce(new, old);
end $$;

create or replace trigger audit_invoices after insert or update or delete on public.invoices
  for each row execute function public.log_audit();
create or replace trigger audit_profiles after update or delete on public.profiles
  for each row execute function public.log_audit();

-- ── updated_at maintenance ───────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create or replace trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create or replace trigger touch_invoices before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ── Atomic invoice numbering ─────────────────────────────────
create or replace function public.next_invoice_no(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update profiles set next_invoice_number = next_invoice_number + 1
  where id = p_user and id = auth.uid()
  returning next_invoice_number - 1 into n;
  if n is null then raise exception 'not authorized'; end if;
  return n;
end $$;

-- ── Zelle encryption helpers (layer 5) ───────────────────────
-- Key lives in Vault: Dashboard → Settings → Vault → add secret 'zelle_key'
-- Simpler v1 approach: pass the key from the server (service role) only.
create or replace function public.set_zelle(p_user uuid, p_value text, p_key text)
returns void language sql security definer set search_path = public, extensions as $$
  update profiles set zelle_info_enc = pgp_sym_encrypt(p_value, p_key) where id = p_user;
$$;
create or replace function public.get_zelle(p_user uuid, p_key text)
returns text language sql security definer set search_path = public, extensions as $$
  select pgp_sym_decrypt(zelle_info_enc, p_key) from profiles where id = p_user;
$$;
revoke execute on function public.set_zelle from anon, authenticated;
revoke execute on function public.get_zelle from anon, authenticated;

-- ═══ RLS (layer 1): deny by default, owner-only access ═══════
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;
alter table public.vault_documents enable row level security;
alter table public.push_subscriptions enable row level security;

-- Policies: drop-then-create (no CREATE OR REPLACE POLICY in Postgres) so a
-- replay/re-run doesn't error on an already-present policy.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own clients" on public.clients;
create policy "own clients" on public.clients
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own invoices" on public.invoices;
create policy "own invoices" on public.invoices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own documents" on public.vault_documents;
create policy "own documents" on public.vault_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══ Storage buckets ═════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('vault', 'vault', false)
  on conflict do nothing;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict do nothing;

drop policy if exists "vault owner read" on storage.objects;
create policy "vault owner read" on storage.objects for select
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "vault owner write" on storage.objects;
create policy "vault owner write" on storage.objects for insert
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "vault owner delete" on storage.objects;
create policy "vault owner delete" on storage.objects for delete
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "logo owner write" on storage.objects;
create policy "logo owner write" on storage.objects for insert
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "logo public read" on storage.objects;
create policy "logo public read" on storage.objects for select
  using (bucket_id = 'logos');

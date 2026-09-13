-- ═══════════════════════════════════════════════════════════════
-- Parse corrections logging for model training signals
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.parse_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  raw_input text,
  model_output jsonb not null default '{}'::jsonb,
  corrected_output jsonb not null default '{}'::jsonb,
  correction_type text not null check (correction_type in ('manual_edit', 'ai_amend'))
);

alter table public.parse_corrections enable row level security;

drop policy if exists "own parse corrections" on public.parse_corrections;
create policy "own parse corrections" on public.parse_corrections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

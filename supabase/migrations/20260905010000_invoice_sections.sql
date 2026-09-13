-- ═══════════════════════════════════════════════════════════════
-- Invoice sections table
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.invoice_sections (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  sort_order int not null default 0,
  show_subtotal boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists invoice_sections_invoice_idx on public.invoice_sections(invoice_id, sort_order);

alter table public.invoice_sections enable row level security;

drop policy if exists "own invoice sections" on public.invoice_sections;
create policy "own invoice sections" on public.invoice_sections
  for all using (
    exists (
      select 1 from public.invoices
      where public.invoices.id = public.invoice_sections.invoice_id
      and public.invoices.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.invoices
      where public.invoices.id = public.invoice_sections.invoice_id
      and public.invoices.user_id = auth.uid()
    )
  );

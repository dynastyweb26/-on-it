-- ═══════════════════════════════════════════════════════════════
-- Tiers phase 2, item 5b — CHANGING (an existing unique constraint and an
-- existing function are replaced, so this may not be pushed from a feature
-- branch; CLAUDE.md "Database migrations").
--
-- 1. (invoice_id, position) becomes DEFERRABLE INITIALLY IMMEDIATE. The new
--    reorder function assigns every position in ONE statement, and a unique
--    index checked row by row would collide transiently (two rows trading
--    places). Deferring to the end of that statement makes a reorder
--    deterministic; it is still enforced before commit, so nothing can end up
--    with duplicates. Initially immediate = every other writer is unchanged.
--
-- 2. reorder_invoice_attachments(p_invoice_id, p_ids) — the ONLY way a client
--    reorders. authenticated holds no UPDATE on invoice_attachments (privilege
--    check AF/AG) and that stays: this is SECURITY DEFINER, checks the caller
--    owns the invoice, that the id list is exactly that invoice's rows once
--    each, and that the document is not a signed or converted estimate, then
--    writes position = array index. No INSERT, no DELETE — so a lapsed user
--    can still reorder what they already have.
--
-- 3. add_estimate_attachment gains the Plus check (tiers_enforced() and
--    is_plus()). Refusing here — before the insert — returns a typed
--    { ok: false, code: 'plan_required' } the confirm route can map to 403,
--    instead of the row trigger's exception surfacing as a 500.
--
-- Both functions that replace an existing body keep their signature, grants
-- and behaviour when tiers_enforced() is false.
-- ═══════════════════════════════════════════════════════════════

-- 1 ── Deferrable position uniqueness ────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'invoice_attachments_invoice_id_position_key'
      and conrelid = 'public.invoice_attachments'::regclass
  ) then
    if not exists (
      select 1 from pg_constraint
      where conname = 'invoice_attachments_invoice_id_position_key'
        and conrelid = 'public.invoice_attachments'::regclass
        and condeferrable
    ) then
      alter table public.invoice_attachments
        drop constraint invoice_attachments_invoice_id_position_key;
      alter table public.invoice_attachments
        add constraint invoice_attachments_invoice_id_position_key
        unique (invoice_id, position) deferrable initially immediate;
    end if;
  else
    alter table public.invoice_attachments
      add constraint invoice_attachments_invoice_id_position_key
      unique (invoice_id, position) deferrable initially immediate;
  end if;
end $$;

-- 2 ── Reorder (SECURITY DEFINER, authenticated only) ─────────────
create or replace function public.reorder_invoice_attachments(
  p_invoice_id uuid,
  p_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_requested int := coalesce(pg_catalog.array_length(p_ids, 1), 0);
  v_rows     int;
  v_distinct int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_invoice_id is null then
    raise exception 'missing invoice' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.invoices i
     where i.id = p_invoice_id and i.user_id = v_uid
  ) then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;

  select count(*)::int into v_rows
    from public.invoice_attachments a
   where a.invoice_id = p_invoice_id;

  select count(distinct x)::int into v_distinct
    from pg_catalog.unnest(coalesce(p_ids, array[]::uuid[])) x;

  -- Exactly the invoice's own rows, once each: nothing missing, nothing
  -- foreign, no duplicates (a duplicate would otherwise collapse silently).
  if v_requested <> v_rows
     or v_distinct <> v_requested
     or (select count(*) from public.invoice_attachments a
          where a.invoice_id = p_invoice_id and a.id = any (p_ids)) <> v_requested
  then
    raise exception 'attachment order does not match the invoice'
      using errcode = '22023';
  end if;

  -- Slots are 0..9 (invoice_attachments_position_check).
  if v_requested > 10 then
    raise exception 'too many attachments' using errcode = '22023';
  end if;

  -- A signed or converted estimate keeps its order (the client-role guard in
  -- guard_locked_estimate_attachments does not run for a definer function).
  if exists (
    select 1 from public.invoices i
     where i.id = p_invoice_id
       and i.kind = 'quote'
       and (
         i.approved_at is not null
         or exists (
           select 1 from public.invoices c
            where c.converted_from = i.id and c.deleted_at is null
         )
       )
  ) then
    raise exception 'A signed or converted estimate cannot change attachments'
      using errcode = 'insufficient_privilege';
  end if;

  -- One statement, positions = array order. Deferred so trading places is not
  -- a transient duplicate.
  set constraints public.invoice_attachments_invoice_id_position_key deferred;

  update public.invoice_attachments a
     set position = t.ord - 1
    from pg_catalog.unnest(p_ids) with ordinality as t(id, ord)
   where a.invoice_id = p_invoice_id
     and a.id = t.id;
end $$;

revoke execute on function public.reorder_invoice_attachments(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_invoice_attachments(uuid, uuid[]) to authenticated;

-- 3 ── add_estimate_attachment: Plus check before the insert ─────
create or replace function public.add_estimate_attachment(
  p_invoice_id uuid,
  p_user_id uuid,
  p_path text,
  p_mime text,
  p_size bigint,
  p_checksum text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_count int;
  v_total bigint;
  v_pos int;
  v_id uuid;
begin
  if p_mime not in ('image/jpeg', 'image/png', 'application/pdf')
     or p_size is null or p_size < 1 or p_size > 10485760
     or p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$'
     or p_path is null or pg_catalog.char_length(p_path) > 400
  then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;

  -- Tiers: a new upload needs Plus while the gates are on. Typed, so the
  -- route answers plan_required instead of a 500.
  if public.tiers_enforced() and not public.is_plus(p_user_id) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'plan_required');
  end if;

  select * into v_inv
    from public.invoices
   where id = p_invoice_id
     and user_id = p_user_id
     and kind = 'quote'
     and deleted_at is null
   for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;
  if v_inv.approved_at is not null
     or exists (
       select 1 from public.invoices c
        where c.converted_from = v_inv.id and c.deleted_at is null
     )
  then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'locked');
  end if;
  if not pg_catalog.starts_with(
    p_path,
    p_user_id::text || '/' || p_invoice_id::text || '/'
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'bad_path');
  end if;
  if exists (
    select 1 from public.invoice_attachments a
     where a.invoice_id = p_invoice_id and a.storage_path = p_path
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'duplicate');
  end if;

  select count(*)::int, coalesce(sum(size_bytes), 0)::bigint
    into v_count, v_total
    from public.invoice_attachments
   where invoice_id = p_invoice_id;

  if v_count >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'too_many');
  end if;
  if v_total + p_size > 26214400 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'total_too_large');
  end if;

  select g into v_pos
    from pg_catalog.generate_series(0, 9) g
   where not exists (
     select 1 from public.invoice_attachments a
      where a.invoice_id = p_invoice_id and a.position = g
   )
   order by g
   limit 1;

  if v_pos is null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'too_many');
  end if;

  insert into public.invoice_attachments
    (user_id, invoice_id, storage_path, position, mime_type, size_bytes, checksum)
  values
    (p_user_id, p_invoice_id, p_path, v_pos, p_mime, p_size, p_checksum)
  returning id into v_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'id', v_id,
    'position', v_pos
  );
end $$;

revoke execute on function public.add_estimate_attachment(
  uuid, uuid, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.add_estimate_attachment(
  uuid, uuid, text, text, bigint, text
) to service_role;

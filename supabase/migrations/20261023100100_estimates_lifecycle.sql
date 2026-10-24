-- ═══════════════════════════════════════════════════════════════
-- Estimates data layer, part 2 (changing).
--
-- No status value is added. An estimate is:
--   approved  = invoices.approved_at IS NOT NULL
--   converted = a non-deleted invoice exists with converted_from = this id
-- Signing writes approved_at (server-only) and a signature row; it never
-- touches status, so every existing invoice/quote query keeps working.
--
-- What changes:
--   1. invoice_attachments.position 0..5 → 0..9 (10 estimate files; the invoice
--      UI/PDF keep their own 6 cap).
--   2. notification_log may record 'estimate_approved'. The full live list is
--      restated — payment_disputed was added by 20261018000000 and must stay.
--   3. pin_invoice_server_columns now pins approved_at, valid_until, revoked_at
--      and public_token. Only sign_estimate (and the owner routes, which use
--      the admin client) can move them.
--   4. lock_sent_invoice_fields keeps its WHEN clause but exempts the CONTENT
--      pins for a sent, unsigned, unconverted quote. Render-snapshot columns
--      and first_sent_at stay pinned after the first send.
--   5. lock_line_items gets the same exemption.
--   6. guard_locked_estimate_edits / guard_locked_estimate_attachments reject
--      client edits once approved/converted (rather than silently pinning).
--   7. sign_estimate: one transaction; FOR UPDATE; idempotent already_approved;
--      recomputes the content hash and rejects a stale one.
--   8. add_estimate_attachment: count / per-file / total quotas under a row lock.
--
-- All SECURITY DEFINER functions use search_path = '' and fully qualified
-- names. Idempotent: create-or-replace functions, drop-then-create triggers
-- and constraints.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Ten attachment slots ───────────────────────────────────
alter table public.invoice_attachments
  drop constraint if exists invoice_attachments_position_check;
alter table public.invoice_attachments
  add constraint invoice_attachments_position_check check (position between 0 and 9);

-- ── 2. Notification type ──────────────────────────────────────
-- Full live list after 20261018000000, plus estimate_approved. Dropping
-- payment_disputed here would break dispute pushes.
alter table public.notification_log drop constraint if exists notification_log_type_chk;
alter table public.notification_log add constraint notification_log_type_chk
  check (event_type in (
    'payment_received', 'payment_disputed', 'connect_problem',
    'invoice_viewed', 'draft_unsent', 'recap', 'recurring_skipped',
    'test', 'estimate_approved'
  ));

-- ── 3. Server-owned invoice columns ───────────────────────────
-- approved_at is now written only by sign_estimate. The existing manual
-- "Mark as signed"/Undo UI writes it from the browser and will be refused
-- (42501) until Session 3 routes that action through the server.
create or replace function public.pin_invoice_server_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;

  if tg_op = 'INSERT' then
    if NEW.amount_paid is distinct from 0
       or NEW.status is distinct from 'draft'
       or NEW.paid_at is not null
       or NEW.sent_at is not null
       or NEW.first_sent_at is not null
       or NEW.viewed_at is not null
       or NEW.last_nudge_at is not null
       or NEW.approved_at is not null
       or NEW.valid_until is not null
       or NEW.revoked_at is not null
    then
      raise exception 'Invoice server-owned fields cannot be set by clients'
        using errcode = 'insufficient_privilege',
              hint = 'Create the invoice as a draft, then send it through the invoice send endpoint.';
    end if;
  else
    if NEW.amount_paid is distinct from OLD.amount_paid
       or NEW.status is distinct from OLD.status
       or NEW.paid_at is distinct from OLD.paid_at
       or NEW.sent_at is distinct from OLD.sent_at
       or NEW.first_sent_at is distinct from OLD.first_sent_at
       or NEW.viewed_at is distinct from OLD.viewed_at
       or NEW.last_nudge_at is distinct from OLD.last_nudge_at
       or NEW.approved_at is distinct from OLD.approved_at
       or NEW.valid_until is distinct from OLD.valid_until
       or NEW.revoked_at is distinct from OLD.revoked_at
       or NEW.public_token is distinct from OLD.public_token
    then
      raise exception 'Invoice server-owned fields cannot be changed by clients'
        using errcode = 'insufficient_privilege',
              hint = 'Record payments through invoice_payments; send through the invoice send endpoint; sign through sign_estimate.';
    end if;
  end if;

  return NEW;
end $$;

drop trigger if exists pin_invoice_server_columns on public.invoices;
create trigger pin_invoice_server_columns
  before insert or update of amount_paid, status, paid_at, sent_at,
    first_sent_at, viewed_at, last_nudge_at, approved_at, valid_until,
    revoked_at, public_token
  on public.invoices
  for each row
  execute function public.pin_invoice_server_columns();

-- ── 4. Sent-document lock: snapshot always, content until signed ──
create or replace function public.lock_sent_invoice_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- First-sent stamp is immutable once set
  NEW.first_sent_at        := OLD.first_sent_at;
  -- Render snapshot — frozen record of what was actually sent. The COLOR-FOR-
  -- ROLES flag (20261020120000) belongs here: without it a re-render could
  -- rescore an old invoice's colors.
  NEW.template             := OLD.template;
  NEW.brand_colors         := OLD.brand_colors;
  NEW.background_color     := OLD.background_color;
  NEW.color_roles_explicit := OLD.color_roles_explicit;
  NEW.business_name        := OLD.business_name;
  NEW.logo_url             := OLD.logo_url;
  NEW.website_url          := OLD.website_url;
  NEW.slogan               := OLD.slogan;
  NEW.cashapp_tag          := OLD.cashapp_tag;
  NEW.paypal_me            := OLD.paypal_me;
  NEW.venmo_username       := OLD.venmo_username;

  -- A sent, unsigned, unconverted quote keeps editable CONTENT. Everything
  -- else — invoices, approved/converted quotes, drafts, paid/overdue/void —
  -- falls through to today's pins.
  if OLD.kind = 'quote'
     and OLD.status = 'sent'
     and OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;

  -- Document money
  NEW.subtotal       := OLD.subtotal;
  NEW.tax_rate       := OLD.tax_rate;
  NEW.tax_amount     := OLD.tax_amount;
  NEW.total          := OLD.total;
  -- Billed party (snapshot)
  NEW.client_name    := OLD.client_name;
  NEW.client_address := OLD.client_address;
  NEW.client_phone   := OLD.client_phone;
  -- Notes + deposit terms + due date
  NEW.notes          := OLD.notes;
  NEW.deposit_type   := OLD.deposit_type;
  NEW.deposit_value  := OLD.deposit_value;
  NEW.due_date       := OLD.due_date;
  return NEW;
end $$;

drop trigger if exists lock_sent_invoice_fields on public.invoices;
create trigger lock_sent_invoice_fields
  before update on public.invoices
  for each row
  when (old.status <> 'draft')
  execute function public.lock_sent_invoice_fields();

-- ── 5. Line items: same editable window ───────────────────────
create or replace function public.lock_line_items()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if OLD.status = 'draft' then
    return NEW;
  end if;
  if OLD.kind = 'quote'
     and OLD.status = 'sent'
     and OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;
  NEW.line_items := OLD.line_items;
  return NEW;
end $$;

drop trigger if exists lock_line_items on public.invoices;
create trigger lock_line_items
  before update on public.invoices
  for each row
  execute function public.lock_line_items();

-- ── 6a. Reject edits after approval/conversion ────────────────
-- This trigger name sorts before lock_* so it sees the attempted change, not
-- the silently pinned value. Client roles only; server routes and signer work
-- are unaffected.
create or replace function public.guard_locked_estimate_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;
  if OLD.kind <> 'quote' then
    return NEW;
  end if;
  if OLD.approved_at is null
     and not exists (
       select 1 from public.invoices i
        where i.converted_from = OLD.id
          and i.deleted_at is null
     )
  then
    return NEW;
  end if;

  if NEW.line_items is distinct from OLD.line_items
     or NEW.subtotal is distinct from OLD.subtotal
     or NEW.tax_rate is distinct from OLD.tax_rate
     or NEW.tax_amount is distinct from OLD.tax_amount
     or NEW.total is distinct from OLD.total
     or NEW.notes is distinct from OLD.notes
     or NEW.client_name is distinct from OLD.client_name
     or NEW.client_address is distinct from OLD.client_address
     or NEW.client_phone is distinct from OLD.client_phone
  then
    raise exception 'A signed or converted estimate cannot be changed'
      using errcode = 'insufficient_privilege',
            hint = 'Create a new estimate instead of editing this one.';
  end if;
  return NEW;
end $$;

drop trigger if exists guard_locked_estimate_edits on public.invoices;
create trigger guard_locked_estimate_edits
  before update on public.invoices
  for each row
  execute function public.guard_locked_estimate_edits();

-- ── 6b. Reject attachment changes after approval/conversion ──
-- Client roles only, so account deletion (service role) still cascades and the
-- server confirm/delete routes remain in control. The same trigger keeps
-- mime_type/size_bytes/checksum server-owned on every attachment row.
create or replace function public.guard_locked_estimate_attachments()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if current_user not in ('anon', 'authenticated') then
    if tg_op = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  -- The verification columns are written only by the service-role confirm path
  -- (add_estimate_attachment reads the stored bytes first). A client that sets
  -- them would publish an object nobody verified; legacy invoice uploads leave
  -- them NULL and keep working unchanged.
  if tg_op in ('INSERT', 'UPDATE')
     and (NEW.mime_type is not null
          or NEW.size_bytes is not null
          or NEW.checksum is not null) then
    raise exception 'Attachment verification fields are server-owned'
      using errcode = 'insufficient_privilege';
  end if;

  v_id := case when tg_op = 'DELETE' then OLD.invoice_id else NEW.invoice_id end;

  if exists (
    select 1
    from public.invoices i
    where i.id = v_id
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

  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end $$;

drop trigger if exists guard_locked_estimate_attachments on public.invoice_attachments;
create trigger guard_locked_estimate_attachments
  before insert or update or delete on public.invoice_attachments
  for each row
  execute function public.guard_locked_estimate_attachments();

-- ── 7. Sign transaction ───────────────────────────────────────
-- The only writer of approved_at and estimate_signatures. Locks the estimate
-- row, validates state, recomputes the hash, writes the signature + approved_at
-- + notification_log in ONE transaction, and returns everything the route
-- needs. A double-tap finds approved_at set and returns already_approved with
-- the stored summary — no second signature, no second notification.
create or replace function public.sign_estimate(
  p_token text,
  p_signer_name text,
  p_signature_type text,
  p_signature_data text,
  p_consent_text text,
  p_consent_version text,
  p_expected_hash text,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv record;
  v_sig record;
  v_hash text;
  v_tz text;
  v_converted boolean;
  v_log_id uuid;
  v_png bytea;
  v_name text;
begin
  -- ── input validation (the route maps these to 400) ──────────
  if p_expected_hash is null or p_expected_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;
  v_name := pg_catalog.btrim(coalesce(p_signer_name, ''));
  if pg_catalog.char_length(v_name) not between 1 and 120 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;
  if p_signature_type is null or p_signature_type not in ('draw', 'type') then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;
  if p_consent_text is null
     or pg_catalog.char_length(p_consent_text) not between 1 and 2000
     or p_consent_version is distinct from '1'
  then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;
  if p_signature_type = 'type' and pg_catalog.char_length(v_name) > 100 then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'validation');
  end if;
  if p_signature_type = 'draw' then
    if p_signature_data is null
       or p_signature_data not like 'data:image/png;base64,%'
    then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_signature');
    end if;
    begin
      v_png := pg_catalog.decode(pg_catalog.split_part(p_signature_data, ',', 2), 'base64');
    exception when others then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_signature');
    end;
    if pg_catalog.octet_length(v_png) > 204800
       or pg_catalog.substr(v_png, 1, 8)
          <> pg_catalog.decode('89504e470d0a1a0a', 'hex')
    then
      return pg_catalog.jsonb_build_object('ok', false, 'code', 'invalid_signature');
    end if;
  end if;

  -- ── lock the estimate ───────────────────────────────────────
  select i.*, p.timezone
    into v_inv
    from public.invoices i
    join public.profiles p on p.id = i.user_id
   where i.public_token = p_token
     and i.kind = 'quote'
     and i.deleted_at is null
   for update of i;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;
  if v_inv.revoked_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'revoked');
  end if;
  if v_inv.approved_at is not null then
    select * into v_sig
      from public.estimate_signatures
     where estimate_id = v_inv.id;
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'already_approved',
      'signature', case when v_sig.id is null then null else pg_catalog.jsonb_build_object(
        'signer_name', v_sig.signer_name,
        'signature_type', v_sig.signature_type,
        'signature_data', v_sig.signature_data,
        'signed_at', v_sig.signed_at
      ) end
    );
  end if;

  select exists (
    select 1 from public.invoices c
     where c.converted_from = v_inv.id and c.deleted_at is null
  ) into v_converted;
  if v_converted then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;
  if v_inv.status <> 'sent' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;

  v_tz := public.estimate_tz(v_inv.timezone);
  if v_inv.valid_until is not null
     and pg_catalog.now() >= public.estimate_expires_at(v_inv.valid_until, v_tz)
  then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'expired');
  end if;

  v_hash := public.estimate_content_hash(v_inv.id);
  if p_expected_hash is distinct from v_hash then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'content_changed');
  end if;

  insert into public.estimate_signatures (
    estimate_id, signer_name, signature_type, signature_data,
    ip, user_agent, consent_text, consent_version, content_hash
  ) values (
    v_inv.id,
    v_name,
    p_signature_type,
    case when p_signature_type = 'type' then v_name else p_signature_data end,
    pg_catalog.left(p_ip, 45),
    pg_catalog.left(p_user_agent, 512),
    p_consent_text,
    p_consent_version,
    v_hash
  )
  returning * into v_sig;

  update public.invoices
     set approved_at = pg_catalog.now()
   where id = v_inv.id;

  insert into public.notification_log (user_id, dedupe_key, event_type)
  values (v_inv.user_id, 'estimate_approved:' || v_inv.id::text, 'estimate_approved')
  on conflict (dedupe_key) do nothing
  returning id into v_log_id;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'signature', pg_catalog.jsonb_build_object(
      'signer_name', v_sig.signer_name,
      'signature_type', v_sig.signature_type,
      'signature_data', v_sig.signature_data,
      'signed_at', v_sig.signed_at
    ),
    'content_hash', v_hash,
    'notification_log_id', v_log_id,
    'estimate_id', v_inv.id,
    'user_id', v_inv.user_id,
    'invoice_number', v_inv.invoice_number,
    'client_name', v_inv.client_name,
    'total', v_inv.total
  );
exception when unique_violation then
  select * into v_sig
    from public.estimate_signatures
   where estimate_id = v_inv.id;
  return pg_catalog.jsonb_build_object(
    'ok', false,
    'code', 'already_approved',
    'signature', case when v_sig.id is null then null else pg_catalog.jsonb_build_object(
      'signer_name', v_sig.signer_name,
      'signature_type', v_sig.signature_type,
      'signature_data', v_sig.signature_data,
      'signed_at', v_sig.signed_at
    ) end
  );
end $$;

revoke execute on function public.sign_estimate(
  text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.sign_estimate(
  text, text, text, text, text, text, text, text, text
) to service_role;

-- ── 8. Attachment commit under a quota lock ───────────────────
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

-- ── 9. Trigger functions are not executable by clients ────────
revoke execute on function public.guard_locked_estimate_edits()
  from public, anon, authenticated;
revoke execute on function public.guard_locked_estimate_attachments()
  from public, anon, authenticated;

-- Verification after applying:
--   select tgname from pg_trigger where tgrelid = 'public.invoices'::regclass
--     and not tgisinternal order by 1;
--   -- assign_document_number, enforce_free_invoice_limit,
--   -- guard_locked_estimate_edits, invoices_public_token, lock_deposit_terms,
--   -- lock_document_identity, lock_line_items, lock_sent_invoice_fields,
--   -- pin_created_at, pin_invoice_refunded_amount, pin_invoice_server_columns,
--   -- set_first_sent_at, touch_invoices
--
--   select tgname from pg_trigger where tgrelid = 'public.invoice_attachments'::regclass
--     and not tgisinternal order by 1;
--   -- guard_locked_estimate_attachments
--
--   select pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'public.invoices'::regclass and tgname = 'pin_invoice_server_columns';
--   -- must list approved_at, valid_until, revoked_at, public_token.
--
-- The proof script is supabase/tests/estimates_lifecycle_proofs.sql.

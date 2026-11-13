-- Feature requests from the ask chat point at the turn they came from.
-- The link is optional: older help gaps and non-chat gaps have no message.
-- ON DELETE SET NULL keeps the gap when its turn is deleted; the gap is still
-- owned by the user and cascades with the account.
alter table public.help_gaps
  add column if not exists message_id uuid references public.chat_messages (id) on delete set null;

-- One feature request per user per message. Partial: rows without a message
-- (the existing help-gap sources) are not constrained.
create unique index if not exists help_gaps_user_message_uidx
  on public.help_gaps (user_id, message_id)
  where message_id is not null;

-- A message id on a gap must name a turn the caller owns. The old policy only
-- checked user_id, so it would have allowed attaching a gap to somebody else's
-- turn by guessing the id.
drop policy if exists "record own help gaps" on public.help_gaps;
create policy "record own help gaps" on public.help_gaps
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      message_id is null
      or exists (
        select 1
        from public.chat_messages m
        where m.id = message_id
          and m.user_id = auth.uid()
      )
    )
  );

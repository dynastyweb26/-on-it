-- 005: allow owners to delete their own logo files.
-- The 'logos' bucket shipped with insert + select policies only (001_init.sql);
-- deny-by-default RLS therefore blocked delete, which the Settings logo manager
-- needs for Remove (and for cleaning up the old file on Replace).
-- Owner-only, additive — same folder-ownership predicate as the write policy.
create policy "logo owner delete" on storage.objects for delete
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Private Storage bucket for listing photos and verification evidence (Supabase only).
-- Files are always served through the app's access-checked /api/files route, never publicly.
-- Skipped automatically where the storage schema does not exist (demo/PGlite, plain Postgres).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('chargeshare', 'chargeshare', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
      on conflict (id) do nothing
    $sql$;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0001 · Kunci akses data (RISK-006, SEC-002)
--
-- Supabase membuka schema "public" lewat Data API, dan anon key memang terlihat
-- di browser. Semua tabel aplikasi (Prisma) tinggal di schema "app" yang TIDAK
-- diekspos, sehingga satu-satunya jalan ke data pembeli adalah server kita.
--
-- Jalankan SEBELUM `prisma migrate deploy`. Aman dijalankan ulang.
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists app;
create schema if not exists ops;

-- Peran yang dipakai Data API tidak boleh menyentuh schema app/ops.
revoke all on schema app from anon, authenticated;
revoke all on schema ops from anon, authenticated;
revoke all on all tables    in schema app from anon, authenticated;
revoke all on all sequences in schema app from anon, authenticated;
revoke all on all functions in schema app from anon, authenticated;

alter default privileges in schema app revoke all on tables    from anon, authenticated;
alter default privileges in schema app revoke all on sequences from anon, authenticated;
alter default privileges in schema app revoke all on functions from anon, authenticated;

-- Lapisan kedua: setiap tabel yang (tidak sengaja) dibuat di public wajib RLS.
-- Tanpa policy, RLS = tolak semua untuk anon/authenticated.
do $$
declare
  t record;
begin
  for t in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end
$$;

-- PENTING (manual, sekali): di Dashboard Supabase → Settings → API → "Exposed schemas",
-- pastikan hanya "public" (dan "graphql_public" bila dipakai). JANGAN tambahkan "app" atau "ops".

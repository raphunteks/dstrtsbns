-- ─────────────────────────────────────────────────────────────────────────────
-- 0003 · Job terjadwal lewat pg_cron + pg_net
--
-- Satu mekanisme untuk Vercel DAN VPS: Postgres memanggil {APP_URL}/api/jobs/<nama>.
-- Pindah server cukup ganti secret "app_url" di Vault.
-- Setiap panggilan memproses satu batch kecil (aman terhadap batas durasi Vercel).
--
-- SEBELUM migrasi ini, buat dua secret di Vault (SQL Editor, sekali saja):
--   select vault.create_secret('https://domain-kamu.com', 'app_url');
--   select vault.create_secret('<isi sama dengan CRON_SECRET di env>', 'cron_secret');
-- Untuk mengganti nilainya nanti: vault.update_secret(<id>, '<nilai baru>').
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

create schema if not exists ops;

create or replace function ops.call_job(job_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url   text;
  secret     text;
  request_id bigint;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'cron_secret';

  if base_url is null or secret is null then
    raise warning 'ops.call_job(%): secret app_url/cron_secret belum dibuat di Vault', job_name;
    return null;
  end if;

  select net.http_post(
    url                  := rtrim(base_url, '/') || '/api/jobs/' || job_name,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-cron-secret', secret
                            ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function ops.call_job(text) from public, anon, authenticated;

-- Jadwal dalam UTC. WITA = UTC+8.
select cron.schedule('dts-expire-reservations',          '* * * * *',    $$select ops.call_job('expire-reservations')$$);
select cron.schedule('dts-process-webhook-inbox',        '* * * * *',    $$select ops.call_job('process-webhook-inbox')$$);
select cron.schedule('dts-send-notifications',           '* * * * *',    $$select ops.call_job('send-notifications')$$);
select cron.schedule('dts-reconcile-pakasir',            '*/5 * * * *',  $$select ops.call_job('reconcile-pakasir')$$);
select cron.schedule('dts-expire-supplier-availability', '*/15 * * * *', $$select ops.call_job('expire-supplier-availability')$$);
select cron.schedule('dts-sync-waybill',                 '*/30 * * * *', $$select ops.call_job('sync-waybill')$$);
select cron.schedule('dts-daily-reconciliation',         '0 18 * * *',   $$select ops.call_job('daily-reconciliation')$$); -- 02:00 WITA

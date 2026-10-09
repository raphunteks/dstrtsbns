# Deploy ke Vercel

1. Import repo `raphunteks/dstrtsbns` di Vercel. Framework terdeteksi Next.js; region `sin1` dari `vercel.json`.
2. Isi Environment Variables sesuai `.env.example` untuk Production dan Preview. `DEPLOY_TARGET=vercel`.
3. `POSTGRES_PRISMA_URL` di Vercel sebaiknya memakai `?pgbouncer=true&connection_limit=1`.
4. Bila integrasi Supabase–Vercel membuat variabel dengan prefix lain (mis. `KV_`), matikan sinkronisasi otomatisnya atau hubungkan ulang tanpa prefix.
5. Set secret Vault `app_url` di Supabase ke domain Vercel produksi.
6. URL webhook Pakasir: `https://<domain>/api/webhooks/pakasir` (aktif mulai Fase 4).

Vercel Cron **tidak** dipakai; job dipicu pg_cron dari Supabase agar sama dengan VPS.

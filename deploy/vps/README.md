# Deploy ke VPS

Prasyarat: Docker + Docker Compose, domain yang A record-nya mengarah ke IP VPS, port 80/443 terbuka.

## Pertama kali

```bash
git clone https://github.com/raphunteks/dstrtsbns.git && cd dstrtsbns
cp .env.example .env        # isi semua nilai; DEPLOY_TARGET=vps; APP_URL=https://domain-kamu
echo "DOMAIN=domain-kamu.com" >> .env
docker compose up -d --build
curl -fsS https://domain-kamu.com/api/health
```

Prisma pada VPS boleh memakai `connection_limit` lebih besar di `POSTGRES_PRISMA_URL` (mis. 5) karena prosesnya berjalan terus.

## Update

```bash
git pull
docker compose up -d --build app
```

## Rollback

```bash
git checkout <commit-sebelumnya>
docker compose up -d --build app
```

Migration database tidak ikut di-rollback otomatis. Jalankan migration hanya lewat workflow **Migrate database** dan pastikan setiap migration kompatibel mundur satu versi.

## Catatan

- Nilai `NEXT_PUBLIC_*` dibekukan saat build. Ganti nilainya → build ulang image.
- Cron tetap berjalan dari Supabase (pg_cron). Pastikan secret Vault `app_url` = URL VPS.
- URL webhook Pakasir = `https://domain-kamu.com/api/webhooks/pakasir` (aktif mulai Fase 4).

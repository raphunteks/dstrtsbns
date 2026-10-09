# Daster Tasbon Olshop

Toko online daster dan pakaian wanita — Next.js + Supabase + Prisma, bisa di-deploy ke Vercel atau VPS.

- Kebutuhan produk: [`docs/prd/02_PRD_Daster_Tasbon_Olshop_v1.2.md`](docs/prd/02_PRD_Daster_Tasbon_Olshop_v1.2.md)
- Sistem desain (ACC): [`DESIGN.md`](DESIGN.md)
- Keputusan stack: [`docs/adr/ADR-003-stack.md`](docs/adr/ADR-003-stack.md)
- Aturan untuk sesi Claude: [`CLAUDE.md`](CLAUDE.md)

## Menjalankan di localhost (Antigravity / VS Code)

Aplikasi **tidak punya mode offline**: database, storage, dan login selalu ke project Supabase. Buat project Supabase **khusus development**, jangan pakai project production.

### 1. Prasyarat

- Node **22** (`node -v`) dan pnpm lewat Corepack: `corepack enable`
- Git
- Buka folder repo di Antigravity → **Terminal → New Terminal** (semua perintah di bawah dijalankan di sana).

```bash
git clone https://github.com/raphunteks/dstrtsbns.git
cd dstrtsbns
cp .env.example .env
```

### 2. Isi `.env`

Minimal yang wajib agar web bisa jalan:

| Variabel | Ambil dari |
|---|---|
| `APP_URL` | `http://localhost:3000` |
| `CRON_SECRET`, `APP_SECRET` | buat sendiri, dua nilai **berbeda** (perintah di bawah) |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | Supabase → Project Settings → API → Project URL (nilai sama) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` atau `..._ANON_KEY` | Project Settings → API Keys → publishable / anon |
| `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → secret / service_role (**rahasia**) |
| `POSTGRES_PRISMA_URL` | tombol **Connect** → *Transaction pooler* (port 6543) + `?pgbouncer=true&connection_limit=1&schema=app` |
| `POSTGRES_URL_NON_POOLING` | **Connect** → *Session pooler* atau *Direct* (port 5432) + `?schema=app` |

```bash
# buat nilai acak untuk CRON_SECRET dan APP_SECRET (jalankan dua kali)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Contoh bentuk URL (ganti `[PASSWORD]` dan host sesuai dashboard):

```env
POSTGRES_PRISMA_URL=postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=app
POSTGRES_URL_NON_POOLING=postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=app
```

Password yang mengandung `@ # / ? %` harus di-*URL-encode* (mis. `@` → `%40`).

Opsional (fitur terkait mati/menolak dengan pesan jelas bila kosong):

- `RAJAONGKIR_COST_API_KEY` — tanpa ini pencarian wilayah & ongkir di checkout gagal (checkout ditahan, ongkir tidak pernah 0).
- `PAKASIR_PROJECT_SLUG`, `PAKASIR_API_KEY`, `PAKASIR_WEBHOOK_SECRET`, `PAKASIR_IS_SANDBOX=true` — tanpa ini tombol Bayar menolak.

### 3. Siapkan database (sekali)

Di Supabase **SQL Editor**, jalankan berurutan:

1. `supabase/migrations/20261009000001_lockdown.sql`
2. `supabase/migrations/20261009000002_storage.sql`
3. *(lewati `…_cron_jobs.sql` di dev lokal — pg_cron di cloud tidak bisa memanggil localhost)*

Lalu di terminal:

```bash
pnpm install            # juga menjalankan prisma generate
pnpm db:migrate:deploy  # membuat tabel di schema app
pnpm db:seed            # kategori + produk contoh (data uji, bukan production)
pnpm dev                # http://localhost:3000
```

Foto produk contoh tampil sebagai "Foto belum tersedia" sampai file diunggah ke bucket `produk` (mis. `contoh/daster-rayon-harian.jpg`).

### 4. Agar checkout bisa dicoba

Ongkir butuh asal kirim + kurir aktif (keputusan OD-004). Untuk uji lokal:

1. Isi `RAJAONGKIR_COST_API_KEY`, restart `pnpm dev`.
2. Cari ID wilayah asal: buka `http://localhost:3000/api/wilayah?q=panakkukang` → salin `id`.
3. Di SQL Editor:

```sql
update app."StoreSettings" set "shippingCouriers" = array['jne','sicepat'] where id = 1;
update app."FulfillmentSource" set "rajaongkirOriginId" = '<ID_DARI_LANGKAH_2>';
```

### 5. Pembayaran Pakasir di lokal

- Pakai **sandbox** (`PAKASIR_IS_SANDBOX=true`).
- Webhook Pakasir tidak bisa menjangkau localhost — **tidak apa-apa**: halaman pesanan mengecek status resmi ke Pakasir sendiri (maks. 1×/4 detik), jadi status lunas tetap muncul.
- Ingin menguji webhook juga: jalankan tunnel (`cloudflared tunnel --url http://localhost:3000`), set `APP_URL` ke URL tunnel, dan isi URL webhook `<APP_URL>/api/webhooks/pakasir` di dashboard Pakasir sandbox.

### 6. Menjalankan job terjadwal secara manual

```bash
curl -X POST http://localhost:3000/api/jobs/expire-reservations -H "x-cron-secret: <CRON_SECRET>"
```

Nama job lain: `process-webhook-inbox`, `reconcile-pakasir`, `send-notifications`, `sync-waybill`, `expire-supplier-availability`, `daily-reconciliation`.

### Masalah umum

| Gejala | Penyebab |
|---|---|
| `harus memuat parameter ?schema=app` | URL Postgres belum diberi `schema=app` |
| `P1001 Can't reach database` | host/port salah, atau password belum di-URL-encode |
| `prepared statement "s0" already exists` | `POSTGRES_PRISMA_URL` port 6543 tanpa `pgbouncer=true` |
| Halaman error `relation ... does not exist` | `pnpm db:migrate:deploy` belum dijalankan |
| "Pengiriman belum dikonfigurasi toko" | langkah 4 belum dilakukan |
| Admin minta MFA terus | akun staf wajib 2FA (aal2) — aktifkan TOTP di akun Supabase Auth |

### Perintah lain

```bash
pnpm test        # unit test
pnpm typecheck
pnpm lint
pnpm build      # cek build production (jalankan production lewat Docker, lihat deploy/vps)
```

## Setup Supabase (sekali per project)

Disarankan region **Singapore (ap-southeast-1)**.

1. **Settings → API → Exposed schemas:** hanya `public` (dan `graphql_public`). Jangan tambahkan `app` atau `ops`.
2. Jalankan SQL di `supabase/migrations/` **berurutan** (lewat SQL Editor atau `supabase db push`):
   - `…_lockdown.sql` — schema `app` tertutup + RLS di `public`
   - `…_storage.sql` — bucket `produk` & `bukti-retur`
   - Buat secret Vault dulu, lalu `…_cron_jobs.sql`:
     ```sql
     select vault.create_secret('https://domain-kamu.com', 'app_url');
     select vault.create_secret('<sama dengan CRON_SECRET>', 'cron_secret');
     ```
3. Tabel aplikasi dibuat Prisma: `pnpm db:migrate:deploy`.

## Deploy

**Vercel:** hubungkan repo, isi env sesuai `.env.example`, region sudah `sin1` lewat `vercel.json`.

**VPS:** lihat [`deploy/vps/README.md`](deploy/vps/README.md).

Saat pindah antara Vercel ↔ VPS: ubah URL webhook di dashboard Pakasir **dan** secret `app_url` di Vault pada saat yang sama dengan pindah DNS.

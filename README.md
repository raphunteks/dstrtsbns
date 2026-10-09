# Daster Tasbon Olshop

Toko online daster dan pakaian wanita — Next.js + Supabase + Prisma, bisa di-deploy ke Vercel atau VPS.

- Kebutuhan produk: [`docs/prd/02_PRD_Daster_Tasbon_Olshop_v1.2.md`](docs/prd/02_PRD_Daster_Tasbon_Olshop_v1.2.md)
- Sistem desain (ACC): [`DESIGN.md`](DESIGN.md)
- Keputusan stack: [`docs/adr/ADR-003-stack.md`](docs/adr/ADR-003-stack.md)
- Aturan untuk sesi Claude: [`CLAUDE.md`](CLAUDE.md)

## Setup lokal

1. Node 22 dan pnpm (`corepack enable`).
2. `cp .env.example .env` lalu isi nilainya. **Jangan** beri prefix `NEXT_PUBLIC_` pada rahasia.
3. `pnpm install`
4. `pnpm dev` → http://localhost:3000

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
3. Tabel aplikasi dibuat Prisma: `pnpm db:migrate:deploy` (mulai Fase 2, saat migration pertama ada).

## Deploy

**Vercel:** hubungkan repo, isi env sesuai `.env.example`, region sudah `sin1` lewat `vercel.json`.

**VPS:** lihat [`deploy/vps/README.md`](deploy/vps/README.md).

Saat pindah antara Vercel ↔ VPS: ubah URL webhook di dashboard Pakasir **dan** secret `app_url` di Vault pada saat yang sama dengan pindah DNS.

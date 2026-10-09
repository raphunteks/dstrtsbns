# CLAUDE.md — Daster Tasbon Olshop

Toko online single-store daster & pakaian wanita. Next.js (App Router) + Supabase (Postgres, Storage, Auth) + Prisma + Tailwind v4. Deploy ke Vercel **dan** VPS dari kode yang sama.

**Sumber kebenaran:** `docs/prd/02_PRD_Daster_Tasbon_Olshop_v1.2.md` (perilaku) dan `DESIGN.md` di root (visual, sudah ACC). Jika kode bertentangan dengan dua dokumen itu, dokumen yang benar — ajukan revisi, jangan ubah diam-diam.

## Aturan inti yang TIDAK boleh dilanggar

1. **Uang = integer rupiah** (BR-001). Pakai `src/lib/money.ts`. Tidak ada float, tidak ada `toFixed`.
2. **Snapshot order** (BR-005): harga, atribut, ongkir, fee, alamat dibekukan saat order dibuat. Perubahan produk tidak mengubah order lama.
3. **Lima status terpisah** di Order: `status`, `paymentStatus`, `fulfillmentStatus`, `refundStatus`, `settlementStatus` (BR-021). Pembeli melihat label sederhana (`src/lib/order-status-labels.ts`), admin melihat rinci.
4. **`paid` hanya dari webhook Pakasir v2** yang lolos `X-Secret` + cocok `txn_id`/`order_id`/`amount`/sandbox, atau dari GET status v2 di server. Redirect browser BUKAN bukti bayar (BR-009, BR-033).
5. **Reservasi stok atomik**, hold 30 menit (BR-003, BR-004). Bayar setelah hold lepas → `payment_exception`, bukan langsung dikirim (BR-011). Uji: 50 checkout paralel ke SKU stok 1 → maksimal 1 sukses (AC-004).
6. **Satu kelompok asal/mode per order** (BR-025). Keranjang campuran → checkout terpisah.
7. **Mode `preorder` / `supplier_fulfilled` mati secara default** (`StoreSettings.featureFlags`) sampai OD-002 diputuskan owner.
8. **Ongkir dari RajaOngkir Shipping Cost di server.** Gagal/kosong → tahan checkout, jangan ongkir 0 (BR-026, FR-021).
9. **Komerce Delivery hanya jika `KOMERCE_DELIVERY_ENABLED=true`**; selain itu fallback kurir manual teraudit (FR-089). Key Cost ≠ key Delivery (BR-037).
10. **Refund manual berizin.** Jangan mengasumsikan API refund Pakasir (§17.3).
11. **Idempotensi** di tombol Bayar, webhook, job (FR-023, FR-026). Event ulang tidak boleh menggandakan efek.
12. **Aksi sensitif → AuditLog** (FR-060): aktor, waktu, objek, aksi, sebelum/sesudah, tanpa secret.

## Batas arsitektur

- `src/server/**` → selalu `import "server-only"`. Rahasia hanya dibaca lewat `getEnv()` di `src/server/env.ts` (ESLint menolak `process.env` di tempat lain).
- Data aplikasi **hanya lewat Prisma** (schema Postgres `app`, tidak diekspos Data API). Klien Supabase dipakai untuk **Auth** dan **Storage** saja.
- `getSupabaseAdmin()` (secret key) melewati semua RLS — hanya untuk operasi server tepercaya.
- Variabel `NEXT_PUBLIC_*` hanya URL Supabase + anon/publishable key. Tidak ada rahasia dengan prefix itu.
- Hak akses diperiksa di server per permintaan (session + role + ownership, SEC-002). `middleware.ts` hanya lapisan kenyamanan.
- Job terjadwal: pg_cron → `POST /api/jobs/<nama>` dengan header `x-cron-secret`. Satu batch per panggilan.
- Jangan pakai fitur khusus Vercel (Vercel Cron sebagai pemicu utama, Vercel Blob, Edge runtime untuk kode yang memakai DB).

## Desain (Hallmark + DESIGN.md)

- `DESIGN.md` di root = sistem desain terkunci. Hallmark membacanya dan tidak memilih tema katalog.
- Token di `src/styles/tokens.css`. Komponen memakai utilitas token (`bg-paper`, `text-ink`, `bg-accent`, `rounded-input`, `shadow-low`) — **tidak ada HEX/OKLCH mentah di komponen**.
- `--color-rule` (#DFD1D7) hanya dekoratif (1.47:1). Batas input memakai `--color-rule-strong` [USULAN REVISI, menunggu ACC owner].
- Heading tidak pernah italic. DM Serif Display hanya untuk satu headline hero kampanye.
- Teks kritis (harga, stok, ongkir, error) ≥ 14px. Target sentuh ≥ 44px. Status = label + ikon, bukan warna saja.
- Logo: header memakai `BrandLockup` (monogram DT + teks HTML). Badge bulat asli (`public/brand/dastertasbon.svg`) untuk media non-web.
- Jangan mengarang testimoni, rating, stok, diskon, atau angka "terpercaya".

## Perintah

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm test                # vitest
pnpm typecheck
pnpm lint
pnpm db:validate         # prisma validate
pnpm db:migrate:dev      # buat migration (butuh POSTGRES_* di .env)
pnpm build
```

## TODO yang sudah diketahui

- **Fase 2:** saat membuat migration pertama (`prisma migrate dev --create-only`), tambahkan manual ke SQL:
  `CHECK ("stockOnHand" >= 0)`, `CHECK ("stockReserved" >= 0 AND "stockReserved" <= "stockOnHand")`,
  `CHECK ("priceIdr" >= 0)`, `CHECK ("quantity" > 0)` di CartItem/OrderItem/StockReservation,
  `CHECK ("grandTotalIdr" >= 0)`, `CHECK ("amountIdr" > 0)` di Refund.
- `pnpm-lock.yaml` belum ada di commit pertama (dibuat oleh CI / install lokal pertama) — commit setelah tersedia, lalu Dockerfile memakai `--frozen-lockfile`.

## Rencana fase

1. Fondasi ← **selesai di branch `fase-1-fondasi`**
2. Katalog & inventori (produk, varian, ledger, reservasi atomik, uji konkurensi)
3. Keranjang, checkout, ongkir RajaOngkir
4. Pembayaran Pakasir v2 (webhook inbox, rekonsiliasi, late-paid exception)
5. Admin & fulfillment (pesanan, resi, fallback manual, refund manual, audit, notifikasi)
6. UI storefront per SCR (Hallmark + DESIGN.md)
7. Hardening (keamanan, SEO, aksesibilitas, backup/restore)

## Keputusan owner yang masih terbuka (jangan diisi tebakan)

OD-002 mode fulfillment aktif · OD-004 alamat asal & kurir · OD-005/014/016 kanal & fee Pakasir · OD-007 kebijakan retur · OD-011 legal · OD-012 jam operasional & cut-off · OD-013 akses Komerce Enterprise.

# ADR-003 — Stack teknis

**Status:** Diputuskan owner, 2026-10-09
**Menutup:** PRD v1.2 §24.3 (framework, database, hosting yang sebelumnya sengaja belum dikunci)

## Keputusan

| Area | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript | Pilihan owner; SSR untuk SEO katalog (NFR-013) |
| Database | Supabase Postgres, schema `app` | Relasional: constraint, transaksi atomik, laporan (FR-058). Redis ditolak sebagai DB utama |
| ORM | Prisma 6 | Migrasi terkelola, tipe end-to-end |
| Storage | Supabase Storage (`produk` publik, `bukti-retur` privat) | Satu vendor dengan DB |
| Auth | Supabase Auth via `@supabase/ssr`; RBAC di tabel `app.StaffRole` | MFA TOTP untuk admin (SEC-001) |
| Styling | Tailwind v4 + token dari DESIGN.md; komponen interaktif shadcn/ui (Radix) mulai Fase 6 | Focus trap & keyboard tertangani (DESIGN.md §12) |
| Job terjadwal | Supabase pg_cron + pg_net → `/api/jobs/*` | Sama di Vercel dan VPS |
| Hosting | Vercel (region `sin1`) dan/atau VPS Docker + Caddy | Portabilitas; `output: "standalone"` |

## Konsekuensi

- Supabase Data API **tidak** boleh mengekspos schema `app` (RISK-006).
- Nilai `NEXT_PUBLIC_*` dibekukan saat build → image Docker VPS dibuat per environment.
- Region Supabase disarankan Singapore (ap-southeast-1) untuk latensi pembeli Indonesia.
- Webhook Pakasir terdaftar per domain; pindah Vercel ↔ VPS = ganti URL webhook + secret `app_url` di Vault pada saat yang sama.

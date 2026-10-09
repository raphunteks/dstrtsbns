-- ─────────────────────────────────────────────────────────────────────────────
-- 0002 · Bucket Storage (SEC-008, FR-046)
--
-- "produk"      : publik baca (foto katalog). Upload hanya dari server lewat
--                 signed upload URL yang dibuat dengan secret key.
-- "bukti-retur" : privat. Dibaca lewat signed URL berumur pendek oleh staf berizin.
--
-- Tidak ada policy INSERT/UPDATE/DELETE untuk anon/authenticated → browser tidak
-- bisa menulis langsung. Server memakai secret key yang melewati RLS.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('produk', 'produk', true, 5242880,
     array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('bukti-retur', 'bukti-retur', false, 10485760,
     array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

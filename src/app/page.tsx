import { BrandLockup } from "@/components/brand/BrandLockup";

/**
 * Placeholder Fase 1 — hanya untuk memastikan fondasi (font, token, logo) ter-build.
 * Diganti oleh SCR-001 Beranda (src/app/(store)/page.tsx) di fase UI.
 */
export default function FoundationPlaceholder() {
  return (
    <main
      id="konten"
      className="mx-auto flex min-h-dvh max-w-[var(--layout-max)] flex-col gap-10 px-[var(--space-gutter)] py-[var(--space-section)]"
    >
      <BrandLockup />

      <section className="flex max-w-[var(--layout-readable)] flex-col gap-4">
        <h1 className="text-h1">Toko sedang disiapkan</h1>
        <p className="text-muted">
          Halaman ini adalah fondasi teknis. Katalog, keranjang, dan pembayaran belum tersedia.
        </p>
      </section>

      <section aria-label="Contoh token desain" className="flex flex-wrap gap-3">
        <span className="inline-flex min-h-[var(--touch-target)] items-center rounded-input bg-accent px-5 text-button font-semibold text-ink-inverse">
          Tombol utama
        </span>
        <span className="inline-flex min-h-[var(--touch-target)] items-center rounded-input border border-accent bg-surface px-5 text-button font-semibold text-accent">
          Tombol sekunder
        </span>
        <span className="tabular inline-flex items-center rounded-pill bg-accent-subtle px-3 py-1 text-small text-ink">
          Rp89.000
        </span>
      </section>
    </main>
  );
}

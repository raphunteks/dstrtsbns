import Link from "next/link";
import { ProductCard } from "@/components/store/ProductCard";
import { ShieldIcon, TruckIcon, RulerIcon } from "@/components/ui/icons";
import { db } from "@/server/db/client";
import { listActiveCategories, listProducts } from "@/server/modules/catalog/queries";
import { listingParamsSchema } from "@/server/modules/catalog/schemas";

export const dynamic = "force-dynamic";

/** SCR-001 Beranda. Tanpa angka penjualan/rating/testimoni karangan. */
export default async function HomePage() {
  const [categories, latest] = await Promise.all([
    listActiveCategories(db),
    listProducts(db, listingParamsSchema.parse({ urut: "terbaru" })),
  ]);
  const topCategories = categories.filter((c) => c.parentId === null);
  const products = latest.items.slice(0, 8);

  return (
    <>
      <section className="bg-accent-subtle">
        <div className="mx-auto max-w-[var(--layout-max)] px-4 py-14 md:px-6 md:py-24">
          <h1 className="max-w-[18ch] font-display text-display text-ink">Nyaman dipakai, senang belanjanya.</h1>
          <p className="mt-4 max-w-[var(--layout-readable)] text-body text-muted">
            Daster dan pakaian rumah wanita dengan tabel ukuran jelas. Harga, stok, dan ongkir ditampilkan sebelum kamu bayar.
          </p>
          <Link
            href="/cari"
            className="mt-8 inline-flex min-h-[var(--touch-target)] items-center rounded-pill bg-accent px-6 text-button font-semibold text-ink-inverse shadow-low hover:bg-accent-hover"
          >
            Lihat katalog
          </Link>
        </div>
      </section>

      {topCategories.length > 0 ? (
        <section id="kategori" aria-labelledby="judul-kategori" className="mx-auto max-w-[var(--layout-max)] scroll-mt-24 px-4 pt-12 md:px-6">
          <h2 id="judul-kategori" className="text-h2 font-bold text-ink">Kategori</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {topCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/kategori/${c.slug}`}
                  className="inline-flex min-h-[var(--touch-target)] items-center rounded-pill border border-rule-strong bg-surface px-5 text-small font-semibold text-ink hover:border-accent hover:text-accent"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="judul-terbaru" className="mx-auto max-w-[var(--layout-max)] px-4 pt-12 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 id="judul-terbaru" className="text-h2 font-bold text-ink">Produk terbaru</h2>
          {latest.total > products.length ? (
            <Link href="/cari" className="inline-flex min-h-[var(--touch-target)] items-center text-small font-semibold text-accent">
              Lihat semua
            </Link>
          ) : null}
        </div>
        {products.length === 0 ? (
          <p className="mt-4 text-body text-muted">Produk sedang disiapkan. Silakan kembali lagi nanti.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-8 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} priority={i < 2} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Cara kami berjualan" className="mx-auto max-w-[var(--layout-max)] px-4 pt-16 md:px-6">
        <ul className="grid gap-4 md:grid-cols-3">
          {[
            { Icon: RulerIcon, title: "Ukuran jelas", text: "Setiap produk punya tabel ukuran dan bahan yang bisa dicek sebelum beli." },
            { Icon: TruckIcon, title: "Ongkir dihitung otomatis", text: "Biaya kirim dihitung dari alamatmu saat checkout, bukan ditebak." },
            { Icon: ShieldIcon, title: "Pembayaran tercatat", text: "Pesanan baru diproses setelah pembayaran dikonfirmasi sistem." },
          ].map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3 rounded-card border border-rule bg-surface p-5">
              <Icon className="size-6 shrink-0 text-accent" />
              <div>
                <h3 className="text-body font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-small text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

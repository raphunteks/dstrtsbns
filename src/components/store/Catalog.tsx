import Link from "next/link";
import type { ListingParams } from "@/server/modules/catalog/schemas";
import type { ProductCard as ProductCardData } from "@/server/modules/catalog/queries";
import { ChevronIcon } from "@/components/ui/icons";
import { ProductCard } from "./ProductCard";

type CatalogProps = {
  /** Path dasar form & paginasi, mis. "/cari" atau "/kategori/daster". */
  basePath: string;
  params: ListingParams;
  result: { items: ProductCardData[]; total: number; page: number; pageCount: number };
  sizes: readonly string[];
  /** Kategori sudah ditentukan oleh path → jangan dikirim ulang lewat query. */
  lockCategory?: boolean;
};

const SIZES_FALLBACK = ["S", "M", "L", "XL", "XXL", "All size"];

function queryString(params: ListingParams, page: number, lockCategory: boolean): string {
  const q = new URLSearchParams();
  if (params.q) q.set("q", params.q);
  if (params.kategori && !lockCategory) q.set("kategori", params.kategori);
  if (params.min != null) q.set("min", String(params.min));
  if (params.max != null) q.set("max", String(params.max));
  if (params.ukuran) q.set("ukuran", params.ukuran);
  if (params.tersedia) q.set("tersedia", "1");
  if (params.urut !== "terbaru") q.set("urut", params.urut);
  if (page > 1) q.set("hal", String(page));
  const s = q.toString();
  return s ? `?${s}` : "";
}

const field = "min-h-[var(--touch-target)] w-full rounded-input border border-rule-strong bg-surface px-3 text-body text-ink";

/** Listing + filter berbasis URL (FR-002–FR-005). Tanpa JS tetap berfungsi (GET form). */
export function Catalog({ basePath, params, result, sizes, lockCategory = false }: CatalogProps) {
  const sizeOptions = sizes.length > 0 ? sizes : SIZES_FALLBACK;
  const filtered = Boolean(params.min != null || params.max != null || params.ukuran || params.tersedia);

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <details className="rounded-card border border-rule bg-surface md:sticky md:top-32 md:w-64 md:shrink-0" open={filtered}>
        <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center px-4 text-small font-semibold text-ink">
          Filter &amp; urutkan
        </summary>
        <form action={basePath} method="get" className="flex flex-col gap-4 border-t border-rule p-4">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          {params.kategori && !lockCategory ? <input type="hidden" name="kategori" value={params.kategori} /> : null}

          <div>
            <label htmlFor="f-urut" className="text-small font-semibold text-ink">Urutkan</label>
            <select id="f-urut" name="urut" defaultValue={params.urut} className={`${field} mt-1`}>
              <option value="terbaru">Terbaru</option>
              <option value="termurah">Harga termurah</option>
              <option value="termahal">Harga termahal</option>
            </select>
          </div>

          <div>
            <label htmlFor="f-ukuran" className="text-small font-semibold text-ink">Ukuran</label>
            <select id="f-ukuran" name="ukuran" defaultValue={params.ukuran ?? ""} className={`${field} mt-1`}>
              <option value="">Semua ukuran</option>
              {sizeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <fieldset>
            <legend className="text-small font-semibold text-ink">Harga (Rp)</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="sr-only" htmlFor="f-min">Harga minimum</label>
              <input id="f-min" name="min" type="number" inputMode="numeric" min={0} step={1000} placeholder="Min" defaultValue={params.min ?? ""} className={field} />
              <label className="sr-only" htmlFor="f-max">Harga maksimum</label>
              <input id="f-max" name="max" type="number" inputMode="numeric" min={0} step={1000} placeholder="Maks" defaultValue={params.max ?? ""} className={field} />
            </div>
          </fieldset>

          <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-body text-ink">
            <input type="checkbox" name="tersedia" value="1" defaultChecked={params.tersedia} className="size-5 accent-accent" />
            Hanya yang tersedia
          </label>

          <div className="flex gap-2">
            <button type="submit" className="min-h-[var(--touch-target)] flex-1 rounded-pill bg-accent px-4 text-button font-semibold text-ink-inverse hover:bg-accent-hover">
              Terapkan
            </button>
            <Link href={`${basePath}${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`} className="inline-flex min-h-[var(--touch-target)] items-center rounded-pill px-4 text-button font-semibold text-accent hover:bg-accent-subtle">
              Reset
            </Link>
          </div>
        </form>
      </details>

      <section aria-label="Daftar produk" className="min-w-0 flex-1">
        <p className="text-small text-muted" role="status">
          {result.total === 0 ? "Tidak ada produk yang cocok." : `${result.total} produk`}
        </p>

        {result.items.length === 0 ? (
          <div className="mt-6 rounded-card border border-rule bg-surface p-6">
            <p className="text-body text-ink">Coba kata kunci lain, hapus beberapa filter, atau lihat semua produk.</p>
            <Link href="/cari" className="mt-4 inline-flex min-h-[var(--touch-target)] items-center rounded-pill bg-accent px-5 text-button font-semibold text-ink-inverse hover:bg-accent-hover">
              Lihat semua produk
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-8 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {result.items.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} priority={i < 2} />
              </li>
            ))}
          </ul>
        )}

        {result.pageCount > 1 ? (
          <nav aria-label="Halaman" className="mt-10 flex items-center justify-between gap-4">
            {result.page > 1 ? (
              <Link href={`${basePath}${queryString(params, result.page - 1, lockCategory)}`} className="inline-flex min-h-[var(--touch-target)] items-center gap-1 rounded-pill border border-rule-strong px-4 text-button font-semibold text-ink">
                <ChevronIcon className="size-4 rotate-180" /> Sebelumnya
              </Link>
            ) : <span />}
            <span className="text-small text-muted">Halaman {result.page} dari {result.pageCount}</span>
            {result.page < result.pageCount ? (
              <Link href={`${basePath}${queryString(params, result.page + 1, lockCategory)}`} className="inline-flex min-h-[var(--touch-target)] items-center gap-1 rounded-pill border border-rule-strong px-4 text-button font-semibold text-ink">
                Berikutnya <ChevronIcon className="size-4" />
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

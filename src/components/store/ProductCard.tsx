import Link from "next/link";
import { formatRupiah } from "@/lib/money";
import type { ProductCard as ProductCardData } from "@/server/modules/catalog/queries";
import { AlertIcon, ClockIcon } from "@/components/ui/icons";
import { ProductImage } from "./ProductImage";
import { modeLabel } from "./labels";

export function priceRange(min: number | null, max: number | null): string {
  if (min == null) return "Harga belum tersedia";
  if (max == null || max === min) return formatRupiah(min);
  return `${formatRupiah(min)} – ${formatRupiah(max)}`;
}

/** Kartu produk katalog (DESIGN.md §7.4): foto, nama, harga, status jujur. */
export function ProductCard({ product, priority = false }: { product: ProductCardData; priority?: boolean }) {
  const onlyNonReady = product.modes.length > 0 && !product.modes.includes("ready_stock");
  return (
    <article className="group relative flex flex-col">
      <ProductImage
        image={product.image}
        priority={priority}
        sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 360px) 50vw, 100vw"
      />
      <div className="mt-3 flex flex-1 flex-col gap-1">
        <h3 className="text-body font-semibold text-ink">
          <Link href={`/produk/${product.slug}`} className="after:absolute after:inset-0 group-hover:underline">
            {product.name}
          </Link>
        </h3>
        <p className="text-price font-bold text-ink">{priceRange(product.minPriceIdr, product.maxPriceIdr)}</p>
        {!product.purchasable ? (
          <p className="inline-flex items-center gap-1 text-small font-medium text-danger">
            <AlertIcon className="size-4" /> Stok habis
          </p>
        ) : onlyNonReady ? (
          <p className="inline-flex items-center gap-1 text-small font-medium text-info">
            <ClockIcon className="size-4" /> {product.modes.map((m) => modeLabel[m]).join(" · ")}
          </p>
        ) : null}
        {product.sizes.length > 0 ? (
          <p className="text-small text-muted">Ukuran: {product.sizes.join(", ")}</p>
        ) : null}
      </div>
    </article>
  );
}

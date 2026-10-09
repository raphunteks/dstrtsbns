import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductImage } from "@/components/store/ProductImage";
import { VariantPicker, type PickerVariant } from "@/components/store/VariantPicker";
import { RulerIcon, TruckIcon } from "@/components/ui/icons";
import { productImageUrl } from "@/lib/media";
import { db } from "@/server/db/client";
import { getPublishedProductBySlug } from "@/server/modules/catalog/queries";
import { sizeChartSchema } from "@/server/modules/catalog/schemas";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const loadProduct = cache((slug: string) => getPublishedProductBySlug(db, slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await loadProduct((await params).slug);
  if (!product) return { title: "Produk tidak ditemukan" };
  const cover = product.media[0];
  return {
    title: product.seoTitle ?? `${product.name} — Daster Tasbon Olshop`,
    description: product.seoDescription ?? product.description.slice(0, 155),
    alternates: { canonical: `/produk/${product.slug}` },
    openGraph: cover ? { images: [{ url: productImageUrl(cover.objectKey), alt: cover.altText }] } : undefined,
  };
}

/** SCR-003 Detail produk. Produk tidak published → 404 (FR-005). */
export default async function ProductPage({ params }: Props) {
  const product = await loadProduct((await params).slug);
  if (!product) notFound();

  const sizeChart = sizeChartSchema.safeParse(product.sizeChart);
  const [cover, ...rest] = product.media;
  const variants: PickerVariant[] = product.variants.map((v) => ({
    id: v.id,
    attributes: v.attributes,
    priceIdr: v.priceIdr,
    compareAtPriceIdr: v.compareAtPriceIdr,
    purchasable: v.availability.purchasable,
    available: v.availability.available,
    mode: v.availability.mode,
    processingDays: v.processingDays,
    originLabel: v.originLabel,
  }));

  return (
    <div className="mx-auto max-w-[var(--layout-max)] px-4 py-6 md:px-6 md:py-10">
      <nav aria-label="Breadcrumb" className="text-small text-muted">
        <ol className="flex flex-wrap gap-2">
          <li><Link href="/" className="hover:text-ink">Beranda</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={`/kategori/${product.category.slug}`} className="hover:text-ink">{product.category.name}</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <div className="mt-4 grid gap-8 md:grid-cols-2 md:gap-12">
        <section aria-label="Foto produk" className="flex flex-col gap-3">
          <ProductImage image={cover ?? null} priority sizes="(min-width: 768px) 50vw, 100vw" />
          {rest.length > 0 ? (
            <ul className="grid grid-cols-4 gap-2">
              {rest.slice(0, 8).map((m) => (
                <li key={m.id}>
                  <ProductImage image={m} sizes="25vw" className="rounded-input" />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="judul-produk" className="flex flex-col gap-6">
          <h1 id="judul-produk" className="text-h1 font-bold text-ink">{product.name}</h1>

          {variants.length > 0 ? (
            <VariantPicker variants={variants} />
          ) : (
            <p className="text-body text-muted">Produk ini belum bisa dibeli.</p>
          )}

          <p className="inline-flex items-start gap-2 rounded-card bg-paper-2 p-4 text-small text-ink">
            <TruckIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            Ongkir dihitung di checkout sesuai alamat dan kurir yang kamu pilih.
          </p>

          {sizeChart.success ? (
            <details className="rounded-card border border-rule bg-surface">
              <summary className="flex min-h-[var(--touch-target)] cursor-pointer items-center gap-2 px-4 text-body font-semibold text-ink">
                <RulerIcon className="size-5 text-accent" /> Tabel ukuran
              </summary>
              <div className="overflow-x-auto border-t border-rule p-4">
                <table className="w-full text-left text-small">
                  <thead>
                    <tr>
                      {sizeChart.data.columns.map((c) => (
                        <th key={c} scope="col" className="border-b border-rule-strong px-2 py-2 font-semibold text-ink">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sizeChart.data.rows.map((row, i) => (
                      <tr key={i} className="border-b border-rule">
                        {row.map((cell, j) =>
                          j === 0 ? (
                            <th key={j} scope="row" className="px-2 py-2 font-semibold text-ink">{cell}</th>
                          ) : (
                            <td key={j} className="px-2 py-2 text-ink">{cell}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sizeChart.data.note ? <p className="mt-3 text-small text-muted">{sizeChart.data.note}</p> : null}
              </div>
            </details>
          ) : null}

          <div className="flex flex-col gap-4 text-body text-ink">
            {product.material ? (
              <div>
                <h2 className="text-h3 font-semibold">Bahan</h2>
                <p className="mt-1 text-muted">{product.material}</p>
              </div>
            ) : null}
            <div>
              <h2 className="text-h3 font-semibold">Deskripsi</h2>
              <p className="mt-1 max-w-[var(--layout-readable)] whitespace-pre-line text-muted">{product.description}</p>
            </div>
            {product.careInstructions ? (
              <div>
                <h2 className="text-h3 font-semibold">Perawatan</h2>
                <p className="mt-1 whitespace-pre-line text-muted">{product.careInstructions}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

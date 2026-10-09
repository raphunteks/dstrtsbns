import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Catalog } from "@/components/store/Catalog";
import { db } from "@/server/db/client";
import { listProducts } from "@/server/modules/catalog/queries";
import { parseListing, STORE_SIZES, type SearchParams } from "../../listing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

async function findCategory(slug: string) {
  return db.category.findFirst({ where: { slug, status: "active" }, select: { name: true, slug: true } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  if (!category) return { title: "Kategori tidak ditemukan" };
  return {
    title: `${category.name} — Daster Tasbon Olshop`,
    alternates: { canonical: `/kategori/${category.slug}` },
  };
}

/** SCR-002 dengan kategori terkunci di path. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await findCategory((await params).slug);
  if (!category) notFound();

  const listing = await parseListing(searchParams, { kategori: category.slug });
  const result = await listProducts(db, listing);

  return (
    <div className="mx-auto max-w-[var(--layout-max)] px-4 py-6 md:px-6 md:py-10">
      <nav aria-label="Breadcrumb" className="text-small text-muted">
        <ol className="flex gap-2">
          <li><Link href="/" className="hover:text-ink">Beranda</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-ink">{category.name}</li>
        </ol>
      </nav>
      <h1 className="mt-2 text-h1 font-bold text-ink">{category.name}</h1>
      <div className="mt-6">
        <Catalog basePath={`/kategori/${category.slug}`} params={listing} result={result} sizes={STORE_SIZES} lockCategory />
      </div>
    </div>
  );
}

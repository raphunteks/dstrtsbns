import type { Metadata } from "next";
import { Catalog } from "@/components/store/Catalog";
import { db } from "@/server/db/client";
import { listProducts } from "@/server/modules/catalog/queries";
import { parseListing, STORE_SIZES, type SearchParams } from "../listing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await parseListing(searchParams);
  return {
    title: params.q ? `Hasil “${params.q}” — Daster Tasbon Olshop` : "Semua produk — Daster Tasbon Olshop",
    robots: params.q ? { index: false, follow: true } : undefined,
  };
}

/** SCR-002 Katalog & pencarian. */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await parseListing(searchParams);
  const result = await listProducts(db, params);

  return (
    <div className="mx-auto max-w-[var(--layout-max)] px-4 py-6 md:px-6 md:py-10">
      <h1 className="text-h1 font-bold text-ink">{params.q ? `Hasil untuk “${params.q}”` : "Semua produk"}</h1>
      <form action="/cari" method="get" role="search" className="mt-4 flex gap-2 md:hidden">
        <label htmlFor="cari-halaman" className="sr-only">Cari produk</label>
        <input
          id="cari-halaman"
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          placeholder="Cari daster, gamis…"
          className="min-h-[var(--touch-target)] flex-1 rounded-input border border-rule-strong bg-surface px-3 text-body text-ink"
        />
        <button type="submit" className="min-h-[var(--touch-target)] rounded-pill bg-accent px-4 text-button font-semibold text-ink-inverse">
          Cari
        </button>
      </form>
      <div className="mt-6">
        <Catalog basePath="/cari" params={params} result={result} sizes={STORE_SIZES} />
      </div>
    </div>
  );
}

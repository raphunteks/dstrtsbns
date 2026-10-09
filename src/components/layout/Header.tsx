import Link from "next/link";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { BagIcon, SearchIcon, UserIcon } from "@/components/ui/icons";

type HeaderProps = {
  cartCount: number;
  categories: { slug: string; name: string }[];
};

/** Header toko (DESIGN.md §7.1): lockup, pencarian, kategori, keranjang. */
export function Header({ cartCount, categories }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur">
      <div className="mx-auto flex max-w-[var(--layout-max)] items-center gap-3 px-4 py-2 md:gap-6 md:px-6">
        <BrandLockup className="shrink-0" />

        <form action="/cari" method="get" role="search" className="hidden flex-1 md:block">
          <label htmlFor="cari-header" className="sr-only">
            Cari produk
          </label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
            <input
              id="cari-header"
              name="q"
              type="search"
              placeholder="Cari daster, gamis, ukuran…"
              className="min-h-[var(--touch-target)] w-full rounded-input border border-rule-strong bg-surface pr-3 pl-10 text-body text-ink placeholder:text-muted"
            />
          </div>
        </form>

        <nav aria-label="Akun dan keranjang" className="ml-auto flex items-center gap-1">
          <Link
            href="/cari"
            className="inline-flex size-[var(--touch-target)] items-center justify-center rounded-pill text-ink hover:bg-paper-2 md:hidden"
          >
            <SearchIcon title="Cari" />
          </Link>
          <Link
            href="/akun"
            className="hidden size-[var(--touch-target)] items-center justify-center rounded-pill text-ink hover:bg-paper-2 md:inline-flex"
          >
            <UserIcon title="Akun" />
          </Link>
          <Link
            href="/keranjang"
            className="relative inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-pill px-3 text-ink hover:bg-paper-2"
          >
            <BagIcon />
            <span className="text-small font-semibold">
              Keranjang
              <span className="sr-only">, {cartCount} barang</span>
            </span>
            {cartCount > 0 ? (
              <span
                aria-hidden="true"
                className="min-w-6 rounded-pill bg-accent px-1.5 text-center text-caption font-bold text-ink-inverse"
              >
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>

      {categories.length > 0 ? (
        <nav aria-label="Kategori" className="hidden border-t border-rule md:block">
          <ul className="mx-auto flex max-w-[var(--layout-max)] gap-1 overflow-x-auto px-6">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/kategori/${c.slug}`}
                  className="inline-flex min-h-[var(--touch-target)] items-center px-3 text-small font-medium text-muted hover:text-ink"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

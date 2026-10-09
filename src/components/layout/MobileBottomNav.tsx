"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { BagIcon, GridIcon, HomeIcon, SearchIcon, UserIcon } from "@/components/ui/icons";

const items = [
  { href: "/", label: "Beranda", Icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/#kategori", label: "Kategori", Icon: GridIcon, match: (p: string) => p.startsWith("/kategori") },
  { href: "/cari", label: "Cari", Icon: SearchIcon, match: (p: string) => p.startsWith("/cari") },
  { href: "/keranjang", label: "Keranjang", Icon: BagIcon, match: (p: string) => p.startsWith("/keranjang") },
  { href: "/akun", label: "Akun", Icon: UserIcon, match: (p: string) => p.startsWith("/akun") },
];

/** Navigasi bawah mobile (DESIGN.md §7.2): ikon + label, target ≥ 44px. */
export function MobileBottomNav({ cartCount }: { cartCount: number }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-caption font-medium",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-6" />
                <span>{label}</span>
                {href === "/keranjang" && cartCount > 0 ? (
                  <span className="sr-only">, {cartCount} barang</span>
                ) : null}
                {href === "/keranjang" && cartCount > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-pill bg-accent px-1 text-center text-caption font-bold text-ink-inverse"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

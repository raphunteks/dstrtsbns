import Link from "next/link";
import { cn } from "@/lib/cn";
import { LogoMark } from "./LogoMark";

type BrandLockupProps = {
  className?: string;
  /** Layar sangat sempit: monogram saja. Nama tetap terbaca oleh pembaca layar lewat aria-label. */
  compact?: boolean;
};

/**
 * Header lockup: monogram DT + nama toko sebagai teks HTML (tajam, terbaca, terindeks).
 * Badge bulat logo asli tidak dipakai di header karena teks di dalamnya hanya ±2px pada tinggi 56px.
 */
export function BrandLockup({ className, compact = false }: BrandLockupProps) {
  return (
    <Link
      href="/"
      aria-label="Daster Tasbon Olshop — beranda"
      className={cn(
        "inline-flex min-h-[var(--touch-target)] items-center gap-2 rounded-sm text-ink",
        className,
      )}
    >
      <LogoMark className="size-9 text-accent" />
      {compact ? null : (
        <span aria-hidden="true" className="flex flex-col leading-none">
          <span className="text-[1.0625rem] font-bold tracking-[-0.01em]">Daster Tasbon</span>
          <span className="mt-0.5 text-caption font-semibold tracking-[0.08em] text-muted">
            OLSHOP
          </span>
        </span>
      )}
    </Link>
  );
}

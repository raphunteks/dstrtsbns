import type { Metadata } from "next";
import Link from "next/link";
import { CartLineControls } from "@/components/store/CartLineControls";
import { modeLabel, processingText } from "@/components/store/labels";
import { AlertIcon, ClockIcon, TruckIcon } from "@/components/ui/icons";
import { formatRupiah } from "@/lib/money";
import { db } from "@/server/db/client";
import { getCurrentCartId } from "@/server/modules/cart/current";
import { getCartView } from "@/server/modules/cart/service";
import { acknowledgePricesAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Keranjang — Daster Tasbon Olshop", robots: { index: false } };

/** SCR-004 Keranjang: harga terkini, dikelompokkan per asal/mode (BR-025). */
export default async function CartPage() {
  const cartId = await getCurrentCartId();
  const view = cartId ? await getCartView(db, cartId) : null;

  if (!view || view.groups.length === 0) {
    return (
      <div className="mx-auto max-w-[var(--layout-checkout-max)] px-4 py-10 md:px-6">
        <h1 className="text-h1 font-bold text-ink">Keranjang</h1>
        <div className="mt-6 rounded-card border border-rule bg-surface p-6">
          <p className="text-body text-ink">Keranjangmu masih kosong.</p>
          <Link href="/cari" className="mt-4 inline-flex min-h-[var(--touch-target)] items-center rounded-pill bg-accent px-5 text-button font-semibold text-ink-inverse hover:bg-accent-hover">
            Mulai belanja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[var(--layout-checkout-max)] px-4 py-6 md:px-6 md:py-10">
      <h1 className="text-h1 font-bold text-ink">Keranjang</h1>

      {view.anyPriceChanged ? (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-card border border-warning bg-surface p-4">
          <p className="inline-flex items-start gap-2 text-small font-semibold text-ink">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-warning" /> Ada harga yang berubah sejak kamu menambahkannya. Harga baru sudah dipakai di bawah.
          </p>
          <form action={acknowledgePricesAction}>
            <button type="submit" className="min-h-[var(--touch-target)] rounded-pill border border-rule-strong px-4 text-button font-semibold text-ink">
              Oke, mengerti
            </button>
          </form>
        </div>
      ) : null}

      {view.needsSplit ? (
        <p className="mt-4 rounded-card bg-paper-2 p-4 text-small text-ink">
          Barang di keranjangmu dikirim dari {view.groups.length} sumber berbeda, jadi checkout dilakukan terpisah per kelompok.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-8">
        {view.groups.map((group, gi) => (
          <section key={group.key} aria-labelledby={`grup-${gi}`} className="rounded-card border border-rule bg-surface">
            <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-3">
              <h2 id={`grup-${gi}`} className="text-h3 font-semibold text-ink">
                {view.needsSplit ? `Kelompok ${gi + 1} · ` : ""}
                {modeLabel[group.mode]}
              </h2>
              <span className="inline-flex items-center gap-1 text-small text-muted">
                <TruckIcon className="size-4" /> {group.originLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-small text-muted">
                <ClockIcon className="size-4" /> {processingText(group.processingDays)}
              </span>
            </header>

            <ul className="divide-y divide-rule">
              {group.lines.map((line) => (
                <li key={line.variantId} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/produk/${line.productSlug}`} className="text-body font-semibold text-ink hover:underline">
                      {line.productName}
                    </Link>
                    {Object.keys(line.attributes).length > 0 ? (
                      <p className="text-small text-muted">
                        {Object.entries(line.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-small text-ink">
                      {formatRupiah(line.unitPriceIdr)}
                      {line.priceChanged ? (
                        <span className="ml-2 text-muted">
                          (sebelumnya <s>{formatRupiah(line.addedPriceIdr)}</s>)
                        </span>
                      ) : null}
                    </p>
                    {line.problem ? (
                      <p role="alert" className="mt-1 inline-flex items-start gap-1 text-small font-semibold text-danger">
                        <AlertIcon className="mt-0.5 size-4 shrink-0" /> {line.problem}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                    <CartLineControls variantId={line.variantId} quantity={line.quantity} max={line.availability.available} />
                    <p className="text-price font-bold text-ink">{formatRupiah(line.lineSubtotalIdr)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <footer className="flex flex-col gap-3 border-t border-rule px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-small text-muted">Subtotal</p>
                <p className="text-h3 font-bold text-ink">{formatRupiah(group.subtotalIdr)}</p>
                <p className="text-small text-muted">Ongkir dihitung di langkah berikutnya.</p>
              </div>
              {group.checkoutReady ? (
                <Link
                  href={`/checkout?g=${encodeURIComponent(group.key)}`}
                  className="inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-pill bg-accent px-6 text-button font-semibold text-ink-inverse shadow-low hover:bg-accent-hover"
                >
                  {view.needsSplit ? `Checkout kelompok ${gi + 1}` : "Lanjut ke checkout"}
                </Link>
              ) : (
                <p className="inline-flex items-center gap-1 text-small font-semibold text-danger">
                  <AlertIcon className="size-4" /> Perbaiki produk yang ditandai dulu
                </p>
              )}
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}

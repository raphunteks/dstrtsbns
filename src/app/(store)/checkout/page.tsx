import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/store/CheckoutForm";
import { modeLabel, processingText } from "@/components/store/labels";
import { formatRupiah } from "@/lib/money";
import { db } from "@/server/db/client";
import { getCurrentCartId } from "@/server/modules/cart/current";
import { getCartView } from "@/server/modules/cart/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout — Daster Tasbon Olshop", robots: { index: false } };

/** SCR-005 Checkout tanpa akun (FR-015). Satu kelompok asal/mode per order (BR-025). */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { g } = await searchParams;
  const cartId = await getCurrentCartId();
  if (!cartId) redirect("/keranjang");
  const view = await getCartView(db, cartId);
  const group = view.groups.find((x) => x.key === g) ?? (view.groups.length === 1 ? view.groups[0] : undefined);
  if (!group || !group.checkoutReady) redirect("/keranjang");

  return (
    <div className="mx-auto max-w-[var(--layout-checkout-max)] px-4 py-6 md:px-6 md:py-10">
      <h1 className="text-h1 font-bold text-ink">Checkout</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <CheckoutForm groupKey={group.key} subtotalIdr={group.subtotalIdr} />
        <aside aria-label="Barang dipesan" className="rounded-card border border-rule bg-paper-2 p-4 lg:sticky lg:top-32">
          <h2 className="text-h3 font-semibold text-ink">Barang ({group.lines.reduce((n, l) => n + l.quantity, 0)})</h2>
          <p className="mt-1 text-small text-muted">
            {modeLabel[group.mode]} · {processingText(group.processingDays)} · dari {group.originLabel}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {group.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3 text-small">
                <span className="text-ink">
                  {l.productName}
                  <span className="block text-muted">
                    {Object.values(l.attributes).join(" · ")} × {l.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-ink">{formatRupiah(l.lineSubtotalIdr)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

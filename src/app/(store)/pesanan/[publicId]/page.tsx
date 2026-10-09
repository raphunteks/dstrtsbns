import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { PaymentPanel } from "@/components/store/PaymentPanel";
import { formatRupiah } from "@/lib/money";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { findOrderByGuestToken, orderAccessCookie } from "@/server/modules/orders/access";
import { getBuyerOrderStatus } from "@/server/modules/payments/buyer-status";
import { getPaymentDeps } from "@/server/modules/payments/deps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesanan — Daster Tasbon Olshop", robots: { index: false, follow: false } };

type Props = { params: Promise<{ publicId: string }>; searchParams: Promise<{ t?: string }> };

/** Tanpa token yang cocok: pesan yang sama untuk "tidak ada" dan "token salah" (AC-008). */
function NotAccessible() {
  return (
    <div className="mx-auto max-w-[var(--layout-checkout-max)] px-4 py-10 md:px-6">
      <h1 className="text-h1 font-bold text-ink">Pesanan tidak ditemukan</h1>
      <p className="mt-3 max-w-[var(--layout-readable)] text-body text-muted">
        Buka pesanan lewat link yang kami kirim setelah checkout. Nomor pesanan saja tidak cukup untuk melihat detailnya.
      </p>
      <Link href="/" className="mt-6 inline-flex min-h-[var(--touch-target)] items-center rounded-pill border border-rule-strong px-5 text-button font-semibold text-ink">
        Kembali ke beranda
      </Link>
    </div>
  );
}

/** SCR-007/008: pembayaran & status pesanan guest. */
export default async function OrderPage({ params, searchParams }: Props) {
  const { publicId } = await params;
  const { t } = await searchParams;
  const token = t ?? (await cookies()).get(orderAccessCookie(publicId))?.value ?? "";
  const orderId = token ? await findOrderByGuestToken(db, getEnv().APP_SECRET, publicId, token) : null;
  if (!orderId) return <NotAccessible />;

  const [status, order, settings] = await Promise.all([
    getBuyerOrderStatus(getPaymentDeps(), orderId),
    db.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        itemsSubtotalIdr: true,
        discountIdr: true,
        shippingIdr: true,
        grandTotalIdr: true,
        shippingAddress: true,
        items: { select: { id: true, productNameSnap: true, attributesSnap: true, quantity: true, lineTotalIdr: true } },
        rateSnapshot: { select: { serviceName: true, etd: true } },
        shipments: { orderBy: { createdAt: "desc" }, take: 1, select: { courierCode: true, serviceCode: true, waybill: true } },
      },
    }),
    db.storeSettings.findUnique({ where: { id: 1 }, select: { paymentMethods: true } }),
  ]);
  // QRIS butuh render kode QR di halaman ini (belum ada) → lewat payment_link saja.
  const methods = (settings?.paymentMethods ?? ["payment_link"]).filter((m) => m !== "qris");
  const address = order.shippingAddress as { recipientName?: string; street?: string; destinationLabel?: string };
  const shipment = order.shipments[0];

  return (
    <div className="mx-auto max-w-[var(--layout-checkout-max)] px-4 py-6 md:px-6 md:py-10">
      <p className="text-small text-muted">Nomor pesanan</p>
      <h1 className="text-h1 font-bold text-ink">{status.publicNumber}</h1>
      <p className="mt-1 text-small text-muted">Simpan link halaman ini untuk mengecek status pesananmu.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="flex flex-col gap-6">
          <PaymentPanel
            publicNumber={status.publicNumber}
            token={token}
            methods={methods}
            initial={{
              status: status.status,
              label: status.label,
              tone: status.tone,
              grandTotalIdr: status.grandTotalIdr,
              payableUntil: status.payableUntil?.toISOString() ?? null,
              pendingPayment: status.pendingPayment
                ? {
                    method: status.pendingPayment.method,
                    paymentUrl: status.pendingPayment.paymentUrl,
                    vaNumber: status.pendingPayment.vaNumber,
                    expiresAt: status.pendingPayment.expiresAt?.toISOString() ?? null,
                  }
                : null,
            }}
          />

          {shipment?.waybill ? (
            <section className="rounded-card border border-rule bg-surface p-4">
              <h2 className="text-h3 font-semibold text-ink">Pengiriman</h2>
              <p className="mt-2 text-body text-ink">
                {shipment.courierCode.toUpperCase()} {shipment.serviceCode} · resi <strong className="font-mono">{shipment.waybill}</strong>
              </p>
            </section>
          ) : null}

          <section className="rounded-card border border-rule bg-surface p-4">
            <h2 className="text-h3 font-semibold text-ink">Dikirim ke</h2>
            <p className="mt-2 text-body text-ink">{address.recipientName}</p>
            <p className="text-small text-muted">{address.street}</p>
            <p className="text-small text-muted">{address.destinationLabel}</p>
            {order.rateSnapshot ? (
              <p className="mt-2 text-small text-ink">
                {order.rateSnapshot.serviceName}
                {order.rateSnapshot.etd ? ` · estimasi ${order.rateSnapshot.etd} hari` : ""}
              </p>
            ) : null}
          </section>
        </div>

        <aside aria-label="Rincian pesanan" className="rounded-card border border-rule bg-paper-2 p-4">
          <h2 className="text-h3 font-semibold text-ink">Rincian</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 text-small">
                <span className="text-ink">
                  {i.productNameSnap}
                  <span className="block text-muted">
                    {Object.values((i.attributesSnap ?? {}) as Record<string, string>).join(" · ")} × {i.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-ink">{formatRupiah(i.lineTotalIdr)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-1 border-t border-rule pt-3 text-small">
            <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="text-ink">{formatRupiah(order.itemsSubtotalIdr)}</dd></div>
            {order.discountIdr > 0 ? (
              <div className="flex justify-between"><dt className="text-muted">Diskon</dt><dd className="text-success">−{formatRupiah(order.discountIdr)}</dd></div>
            ) : null}
            <div className="flex justify-between"><dt className="text-muted">Ongkir</dt><dd className="text-ink">{formatRupiah(order.shippingIdr)}</dd></div>
            <div className="flex justify-between pt-1"><dt className="font-bold text-ink">Total</dt><dd className="font-bold text-ink">{formatRupiah(order.grandTotalIdr)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}

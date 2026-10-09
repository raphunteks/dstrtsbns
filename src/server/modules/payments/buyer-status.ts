import "server-only";
import { customerOrderStatus, type OrderStatusValue } from "@/lib/order-status-labels";
import { verifyAttemptStatus } from "./reconcile";
import type { PaymentDeps } from "./types";

/**
 * Status pesanan untuk halaman pembeli (SCR-007/008, AC-020).
 * Kembali dari halaman Pakasir TIDAK berarti lunas: selama belum ada konfirmasi resmi, status tetap
 * "Menunggu verifikasi". Bila attempt masih pending, status resmi dicek (maks. sekali per 4 detik).
 */
export async function getBuyerOrderStatus(deps: PaymentDeps, orderId: string) {
  const { db } = deps;
  const latest = await db.paymentAttempt.findFirst({
    where: { orderId, status: "pending", txnId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest) {
    try {
      await verifyAttemptStatus(deps, latest.id);
    } catch {
      // Provider sedang bermasalah: tampilkan status terakhir yang diketahui, jangan klaim lunas.
    }
  }

  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      publicNumber: true,
      status: true,
      paymentStatus: true,
      grandTotalIdr: true,
      reservationExpiresAt: true,
      paymentAttempts: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { method: true, paymentUrl: true, qrString: true, vaNumber: true, expiresAt: true },
      },
    },
  });

  const label = customerOrderStatus[order.status as OrderStatusValue];
  const awaitingVerification = order.status === "pending_payment" && order.paymentStatus === "pending";
  return {
    publicNumber: order.publicNumber,
    status: order.status,
    label: awaitingVerification ? "Menunggu verifikasi pembayaran" : label.label,
    tone: label.tone,
    grandTotalIdr: order.grandTotalIdr,
    payableUntil: order.status === "pending_payment" ? order.reservationExpiresAt : null,
    pendingPayment: order.paymentAttempts[0] ?? null,
  };
}

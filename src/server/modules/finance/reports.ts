import "server-only";
import type { PrismaClient } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";

/**
 * Ringkasan penjualan (FR-058, §16.2). Definisi tegas agar laporan tidak menyesatkan:
 *  • Penjualan dihitung dari order yang LUNAS (paidAt dalam periode). Pending tidak pernah dihitung.
 *  • Refund dihitung dari refund SUKSES dengan succeededAt dalam periode (bisa milik order periode lain).
 *  • Net = total dibayar − refund sukses. Settlement Pakasir dilaporkan terpisah (BR-021).
 */
export async function salesSummary(db: PrismaClient, actor: StaffActor, period: { from: Date; to: Date }) {
  assertCan(actor, "order.read");
  const paidWhere = {
    paidAt: { gte: period.from, lt: period.to },
    paymentStatus: "paid" as const,
  };
  const [orders, refunds] = await Promise.all([
    db.order.aggregate({
      where: paidWhere,
      _count: { _all: true },
      _sum: { itemsSubtotalIdr: true, discountIdr: true, shippingIdr: true, feeIdr: true, grandTotalIdr: true },
    }),
    db.refund.aggregate({
      where: { status: "succeeded", succeededAt: { gte: period.from, lt: period.to } },
      _count: { _all: true },
      _sum: { amountIdr: true },
    }),
  ]);
  const gross = orders._sum.grandTotalIdr ?? 0;
  const refunded = refunds._sum.amountIdr ?? 0;
  return {
    period,
    paidOrders: orders._count._all,
    itemsSubtotalIdr: orders._sum.itemsSubtotalIdr ?? 0,
    discountIdr: orders._sum.discountIdr ?? 0,
    shippingIdr: orders._sum.shippingIdr ?? 0,
    feeIdr: orders._sum.feeIdr ?? 0,
    grossPaidIdr: gross,
    refundCount: refunds._count._all,
    refundedIdr: refunded,
    netIdr: gross - refunded,
  };
}

/** Antrean tindakan dashboard (FR-041), dibatasi sesuai izin. */
export async function dashboardSummary(db: PrismaClient, actor: StaffActor) {
  assertCan(actor, "order.read");
  const [toProcess, packed, awaitingPayment, paymentExceptions, fulfillmentExceptions, refundsOpen, lowStock] =
    await Promise.all([
      db.order.count({ where: { status: { in: ["paid", "processing"] } } }),
      db.order.count({ where: { status: "packed" } }),
      db.order.count({ where: { status: "pending_payment" } }),
      db.order.count({ where: { status: "payment_exception" } }),
      db.order.count({ where: { fulfillmentStatus: "fulfillment_exception" } }),
      db.refund.count({ where: { status: { in: ["pending", "processing"] } } }),
      db.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "app"."ProductVariant"
         WHERE "status" = 'active' AND "fulfillmentMode" = 'ready_stock'
           AND "stockOnHand" - "stockReserved" <= COALESCE("lowStockThreshold", 2)`,
    ]);
  return {
    toProcess,
    packed,
    awaitingPayment,
    paymentExceptions,
    fulfillmentExceptions,
    refundsOpen,
    lowStockVariants: Number(lowStock[0]?.count ?? 0n),
    generatedAt: new Date(),
  };
}

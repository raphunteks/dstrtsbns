import "server-only";
import type { PrismaClient } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { contendedTx } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";
import { releaseForOrder, returnCommittedForOrder } from "@/server/modules/inventory/reservations";
import { requestRefundInTx } from "@/server/modules/refunds/service";
import { IllegalTransitionError } from "./fulfillment";

/**
 * Pembatalan oleh staf (BR-013, FLOW-04):
 *  • Belum dibayar → lepas hold. Transaksi Pakasir yang masih terbuka dibatalkan job rekonsiliasi.
 *  • Sudah dibayar, belum dikirim → stok kembali (beralasan) + pengajuan refund penuh untuk finance.
 *    Status menjadi refund_pending, BUKAN refunded — pengajuan bukan refund sukses.
 *  • Sudah dikirim → tidak bisa dibatalkan; gunakan alur retur.
 */
export async function cancelOrder(
  db: PrismaClient,
  actor: StaffActor,
  input: { orderId: string; reason: string },
) {
  assertCan(actor, "order.process");
  if (input.reason.trim().length < 5) {
    throw new ValidationError([{ path: "reason", message: "Alasan pembatalan wajib diisi." }]);
  }

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, status: true, paymentStatus: true, fulfillmentStatus: true, grandTotalIdr: true },
    });
    if (!order) throw new NotFoundError("Order");

    if (order.status === "pending_payment") {
      await releaseForOrder(tx, order.id, "released");
      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", paymentStatus: "canceled", cancelledAt: new Date() },
      });
    } else if (
      order.paymentStatus === "paid" &&
      ["paid", "processing", "packed"].includes(order.status) &&
      !["shipped", "delivered", "shipment_requested"].includes(order.fulfillmentStatus)
    ) {
      await returnCommittedForOrder(tx, order.id);
      await tx.order.update({ where: { id: order.id }, data: { status: "cancelled", cancelledAt: new Date() } });
      await requestRefundInTx(tx, actor, {
        orderId: order.id,
        amountIdr: order.grandTotalIdr,
        reason: `Pembatalan pesanan: ${input.reason.trim()}`,
        method: "manual_transfer",
      });
      await tx.notificationLog.createMany({
        data: [{ template: "order_cancelled", orderId: order.id, channel: "email", idempotencyKey: `order-cancelled:${order.id}` }],
        skipDuplicates: true,
      });
    } else {
      throw new IllegalTransitionError("order.cancel", order);
    }

    await writeAudit(tx, {
      actor,
      action: "order.cancel",
      targetType: "Order",
      targetId: order.id,
      before: { status: order.status, paymentStatus: order.paymentStatus },
      after: { status: "cancelled" },
      reason: input.reason,
    });
  }, contendedTx);
}

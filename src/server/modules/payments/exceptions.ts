import "server-only";
import type { PrismaClient } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { contendedTx } from "@/server/db/types";
import { DomainError, NotFoundError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";
import { commitForOrder, reserveForOrder } from "@/server/modules/inventory/reservations";
import { requestRefundInTx } from "@/server/modules/refunds/service";
import { getFeatureFlags } from "@/server/modules/settings/feature-flags";

export class ExceptionResolutionError extends DomainError {
  constructor(message: string) {
    super("payment_exception_unresolvable", message);
    this.name = "ExceptionResolutionError";
  }
}

/**
 * Finance menyelesaikan pembayaran terlambat (BR-011, AC-005, SOP "Pembayaran tak cocok"):
 *  • "fulfill": stok dicoba dialokasikan ulang SEKARANG (atomik). Berhasil → order lunas & diproses.
 *    Stok sudah habis → ditolak; finance harus memilih refund. Tidak pernah oversell.
 *  • "refund": ajukan refund penuh (manual, butuh persetujuan kedua).
 */
export async function resolvePaymentException(
  db: PrismaClient,
  actor: StaffActor,
  input: { orderId: string; decision: "fulfill" | "refund"; note: string },
) {
  assertCan(actor, "refund.approve");
  const flags = await getFeatureFlags(db);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        status: true,
        grandTotalIdr: true,
        fulfillmentMode: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });
    if (!order) throw new NotFoundError("Order");
    if (order.status !== "payment_exception") {
      throw new ExceptionResolutionError("Pesanan ini tidak dalam status pengecualian pembayaran.");
    }

    if (input.decision === "fulfill") {
      const lines = order.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity }));
      // Reservasi lama yang sudah kedaluwarsa tidak menahan apa pun; dihapus agar bisa dialokasikan ulang.
      await tx.stockReservation.deleteMany({ where: { orderId: order.id, state: { in: ["expired", "released"] } } });
      try {
        await reserveForOrder(tx, { orderId: order.id, expiresAt: new Date(Date.now() + 60_000), lines, flags });
      } catch {
        throw new ExceptionResolutionError("Stok tidak lagi mencukupi. Pilih refund untuk pesanan ini.");
      }
      await commitForOrder(tx, order.id);
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "paid",
          paymentStatus: "paid",
          paidAt: new Date(),
          fulfillmentStatus: order.fulfillmentMode === "preorder" ? "awaiting_supply" : "not_started",
        },
      });
    } else {
      await requestRefundInTx(tx, actor, {
        orderId: order.id,
        amountIdr: order.grandTotalIdr,
        reason: `Pengecualian pembayaran: ${input.note}`,
        method: "manual_transfer",
      });
    }

    await writeAudit(tx, {
      actor,
      action: `payment_exception.${input.decision}`,
      targetType: "Order",
      targetId: order.id,
      before: { status: order.status },
      reason: input.note,
    });
  }, contendedTx);
}

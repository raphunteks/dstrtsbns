import "server-only";
import type { FulfillmentMode, FulfillmentStatus, PrismaClient } from "@prisma/client";
import { contendedTx } from "@/server/db/types";
import { writeAudit } from "@/server/modules/audit/log";
import { commitForOrder } from "@/server/modules/inventory/reservations";

export type CompletionOutcome = "paid" | "payment_exception" | "duplicate_event" | "duplicate_payment";

const initialFulfillment: Record<FulfillmentMode, FulfillmentStatus> = {
  ready_stock: "not_started",
  preorder: "awaiting_supply",
  supplier_fulfilled: "supplier_confirmed", // komitmen pemasok sudah diverifikasi sebelum bayar (BR-028)
};

/**
 * Terapkan pembayaran TERVERIFIKASI ke order — tepat sekali (FR-026, AC-003, AC-017).
 *
 * Dipanggil hanya setelah validasi X-Secret / identitas transaksi / nominal / sandbox DAN konfirmasi
 * status resmi Pakasir. Event ganda (webhook ulang, webhook + polling) tertahan oleh fingerprint unik.
 *
 *  • Order masih pending_payment & reservasi aktif → paid, stok dikurangi sekali.
 *  • Reservasi sudah lepas / order kedaluwarsa / batal → payment_exception, stok TIDAK disentuh
 *    (BR-004, BR-011). Finance memutuskan refund atau pemenuhan.
 *  • Order sudah lunas dari attempt lain → pembayaran ganda, dicatat untuk refund (duplicate_payment).
 */
export async function applyVerifiedCompletion(
  db: PrismaClient,
  input: { attemptId: string; fingerprint: string; completedAt: Date; payload: object; now: Date },
): Promise<CompletionOutcome> {
  return db.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({
      where: { id: input.attemptId },
      select: { id: true, orderId: true, status: true },
    });
    await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${attempt.orderId}::uuid FOR UPDATE`;

    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "app"."PaymentEvent" ("id", "paymentAttemptId", "fingerprint", "eventType", "validation", "payloadRedacted", "processedAt")
      VALUES (gen_random_uuid(), ${attempt.id}::uuid, ${input.fingerprint}, 'completed', 'valid',
              ${JSON.stringify(input.payload)}::jsonb, ${input.now})
      ON CONFLICT ("fingerprint") DO NOTHING
      RETURNING "id"`;
    if (inserted.length === 0 || attempt.status === "completed") return "duplicate_event";

    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "completed", completedAt: input.completedAt, verifiedStatusAt: input.now },
    });

    const order = await tx.order.findUniqueOrThrow({
      where: { id: attempt.orderId },
      select: { id: true, status: true, paymentStatus: true, fulfillmentMode: true, contact: true },
    });

    if (order.paymentStatus === "paid") {
      await writeAudit(tx, {
        actor: null,
        action: "payment.duplicate_payment",
        targetType: "Order",
        targetId: order.id,
        after: { attemptId: attempt.id },
        reason: "Pembayaran kedua untuk order yang sudah lunas — perlu refund oleh finance",
      });
      return "duplicate_payment";
    }

    const converted = order.status === "pending_payment" ? await commitForOrder(tx, order.id) : 0;

    if (converted > 0) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "paid",
          paymentStatus: "paid",
          paidAt: input.completedAt,
          fulfillmentStatus: initialFulfillment[order.fulfillmentMode],
        },
      });
      await tx.notificationLog.createMany({
        data: [
          { template: "order_paid", orderId: order.id, channel: "email", idempotencyKey: `order-paid:${order.id}` },
          { template: "staff_order_ready", orderId: order.id, channel: "email", idempotencyKey: `staff-order-ready:${order.id}` },
        ],
        skipDuplicates: true,
      });
      await writeAudit(tx, {
        actor: null,
        action: "payment.completed",
        targetType: "Order",
        targetId: order.id,
        before: { status: order.status, paymentStatus: order.paymentStatus },
        after: { status: "paid", attemptId: attempt.id },
      });
      return "paid";
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "payment_exception", paymentStatus: "exception" },
    });
    await tx.notificationLog.createMany({
      data: [
        {
          template: "finance_payment_exception",
          orderId: order.id,
          channel: "email",
          idempotencyKey: `payment-exception:${order.id}:${attempt.id}`,
        },
      ],
      skipDuplicates: true,
    });
    await writeAudit(tx, {
      actor: null,
      action: "payment.exception",
      targetType: "Order",
      targetId: order.id,
      before: { status: order.status, paymentStatus: order.paymentStatus },
      after: { status: "payment_exception", attemptId: attempt.id },
      reason: "Dana masuk setelah reservasi stok dilepas (BR-011)",
    });
    return "payment_exception";
  }, contendedTx);
}

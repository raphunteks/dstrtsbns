import "server-only";
import type { PrismaClient } from "@prisma/client";
import { writeAudit } from "@/server/modules/audit/log";

/**
 * Rekonsiliasi harian (FR-090, RISK-003): cari ketidaksesuaian antara pembayaran dan status order.
 * Tidak memperbaiki otomatis — mencatat temuan untuk finance (BR-021: status bayar ≠ status order).
 *
 *  A. Attempt "completed" tetapi order belum paid/exception/refund → pembayaran tidak tercatat.
 *  B. Order "paid" tanpa attempt completed → status lunas tanpa bukti.
 *  C. Order "paid" lebih dari satu attempt completed → pembayaran ganda (perlu refund).
 */
export async function dailyReconciliation(db: PrismaClient, now = new Date()) {
  const [unrecorded, unbacked, duplicates] = await Promise.all([
    db.$queryRaw<{ orderId: string }[]>`
      SELECT DISTINCT a."orderId" FROM "app"."PaymentAttempt" a
        JOIN "app"."Order" o ON o."id" = a."orderId"
       WHERE a."status" = 'completed'
         AND o."paymentStatus" NOT IN ('paid', 'exception')
       LIMIT 200`,
    db.$queryRaw<{ orderId: string }[]>`
      SELECT o."id" AS "orderId" FROM "app"."Order" o
       WHERE o."paymentStatus" = 'paid'
         AND NOT EXISTS (SELECT 1 FROM "app"."PaymentAttempt" a WHERE a."orderId" = o."id" AND a."status" = 'completed')
       LIMIT 200`,
    db.$queryRaw<{ orderId: string }[]>`
      SELECT a."orderId" FROM "app"."PaymentAttempt" a
       WHERE a."status" = 'completed'
       GROUP BY a."orderId" HAVING COUNT(*) > 1
       LIMIT 200`,
  ]);

  const findings = {
    unrecordedPayments: unrecorded.map((r) => r.orderId),
    paidWithoutPayment: unbacked.map((r) => r.orderId),
    duplicatePayments: duplicates.map((r) => r.orderId),
  };
  const total = findings.unrecordedPayments.length + findings.paidWithoutPayment.length + findings.duplicatePayments.length;

  await writeAudit(db, {
    actor: null,
    action: "reconciliation.daily",
    targetType: "System",
    targetId: now.toISOString().slice(0, 10),
    after: findings,
    reason: total === 0 ? "Tidak ada selisih" : `${total} temuan perlu ditinjau finance`,
  });
  return { total, findings };
}

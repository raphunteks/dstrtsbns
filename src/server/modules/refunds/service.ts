import "server-only";
import type { OrderStatus, PrismaClient, RefundMethod, RefundStatus } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { contendedTx, type Tx } from "@/server/db/types";
import { DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";

/**
 * Refund MANUAL berizin (FR-053, FR-057, §17.3). Pakasir v2 tidak mendokumentasikan API refund,
 * jadi dana dikembalikan finance di luar sistem lalu dicatat dengan bukti.
 *
 *   pending (diajukan) → processing (disetujui) → succeeded (dana terkonfirmasi) | failed
 *
 * • Total refund aktif + sukses tidak boleh melebihi dana yang benar-benar diterima (BR-014).
 * • Penyetuju harus orang berbeda dari pengaju, kecuali super admin (PRD §11: persetujuan kedua).
 * • `succeeded` hanya dengan referensi/bukti; pengajuan bukan berarti refund sukses (FLOW-04).
 */

export class RefundRuleError extends DomainError {
  constructor(code: "exceeds_paid" | "nothing_paid" | "same_person" | "bad_state", message: string) {
    super(`refund_${code}`, message);
    this.name = "RefundRuleError";
  }
}

const ACTIVE: RefundStatus[] = ["pending", "processing", "succeeded"];

/** Status order yang mengikuti hasil refund (order aktif dengan pembayaran ganda tidak ikut berubah). */
const FOLLOWS_REFUND: OrderStatus[] = ["cancelled", "payment_exception", "returned", "refund_pending", "partially_refunded", "refunded"];

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, refundStatus: true } });
  if (!order) throw new NotFoundError("Order");
  return order;
}

async function amounts(tx: Tx, orderId: string) {
  const paid = await tx.paymentAttempt.aggregate({
    where: { orderId, status: "completed" },
    _sum: { amountIdr: true },
  });
  const refunded = await tx.refund.aggregate({
    where: { orderId, status: { in: ACTIVE } },
    _sum: { amountIdr: true },
  });
  const succeeded = await tx.refund.aggregate({
    where: { orderId, status: "succeeded" },
    _sum: { amountIdr: true },
  });
  return {
    paidIdr: paid._sum.amountIdr ?? 0,
    committedIdr: refunded._sum.amountIdr ?? 0,
    succeededIdr: succeeded._sum.amountIdr ?? 0,
  };
}

/** Perbarui ringkasan refund di order dari baris refund (sumber kebenaran). */
async function syncOrderRefundState(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  const { paidIdr, succeededIdr } = await amounts(tx, orderId);
  const open = await tx.refund.count({ where: { orderId, status: { in: ["pending", "processing"] } } });

  let refundStatus: RefundStatus = "not_requested";
  if (open > 0) refundStatus = "pending";
  else if (succeededIdr > 0 && succeededIdr >= paidIdr) refundStatus = "succeeded";
  else if (succeededIdr > 0) refundStatus = "partial";
  else if ((await tx.refund.count({ where: { orderId, status: "failed" } })) > 0) refundStatus = "failed";

  let status: OrderStatus | undefined;
  if (FOLLOWS_REFUND.includes(order.status)) {
    if (refundStatus === "succeeded") status = "refunded";
    else if (refundStatus === "partial") status = "partially_refunded";
    else if (refundStatus === "pending") status = "refund_pending";
  }
  await tx.order.update({ where: { id: orderId }, data: { refundStatus, ...(status ? { status } : {}) } });
}

export async function requestRefundInTx(
  tx: Tx,
  actor: StaffActor,
  input: { orderId: string; amountIdr: number; reason: string; method: RefundMethod },
) {
  assertCan(actor, "refund.request");
  if (!Number.isSafeInteger(input.amountIdr) || input.amountIdr <= 0) {
    throw new ValidationError([{ path: "amountIdr", message: "Nominal refund harus rupiah bulat > 0." }]);
  }
  if (input.reason.trim().length < 5) {
    throw new ValidationError([{ path: "reason", message: "Alasan refund wajib diisi." }]);
  }
  await lockOrder(tx, input.orderId);
  const { paidIdr, committedIdr } = await amounts(tx, input.orderId);
  if (paidIdr === 0) throw new RefundRuleError("nothing_paid", "Belum ada pembayaran yang diterima untuk pesanan ini.");
  if (committedIdr + input.amountIdr > paidIdr) {
    throw new RefundRuleError(
      "exceeds_paid",
      `Refund melebihi dana yang diterima. Sisa yang bisa dikembalikan: ${paidIdr - committedIdr}.`,
    );
  }
  const attempt = await tx.paymentAttempt.findFirstOrThrow({
    where: { orderId: input.orderId, status: "completed" },
    orderBy: { completedAt: "asc" },
    select: { id: true },
  });
  const refund = await tx.refund.create({
    data: {
      orderId: input.orderId,
      paymentAttemptId: attempt.id,
      amountIdr: input.amountIdr,
      method: input.method,
      reason: input.reason.trim(),
      requestedById: actor.userId,
      status: "pending",
    },
    select: { id: true },
  });
  await syncOrderRefundState(tx, input.orderId);
  await writeAudit(tx, {
    actor,
    action: "refund.request",
    targetType: "Refund",
    targetId: refund.id,
    after: { orderId: input.orderId, amountIdr: input.amountIdr, method: input.method },
    reason: input.reason,
  });
  return refund;
}

export async function requestRefund(
  db: PrismaClient,
  actor: StaffActor,
  input: { orderId: string; amountIdr: number; reason: string; method: RefundMethod },
) {
  return db.$transaction((tx) => requestRefundInTx(tx, actor, input), contendedTx);
}

async function loadRefundLocked(tx: Tx, refundId: string) {
  const refund = await tx.refund.findUnique({ where: { id: refundId } });
  if (!refund) throw new NotFoundError("Refund");
  await lockOrder(tx, refund.orderId);
  return tx.refund.findUniqueOrThrow({ where: { id: refundId } });
}

export async function approveRefund(db: PrismaClient, actor: StaffActor, refundId: string) {
  assertCan(actor, "refund.approve");
  return db.$transaction(async (tx) => {
    const refund = await loadRefundLocked(tx, refundId);
    if (refund.status !== "pending") throw new RefundRuleError("bad_state", "Refund ini tidak menunggu persetujuan.");
    const isSuper = actor.roles.includes("super_admin");
    if (refund.requestedById === actor.userId && !isSuper) {
      throw new RefundRuleError("same_person", "Refund harus disetujui orang lain selain pengaju.");
    }
    await tx.refund.update({ where: { id: refundId }, data: { status: "processing", approvedById: actor.userId } });
    await syncOrderRefundState(tx, refund.orderId);
    await writeAudit(tx, {
      actor,
      action: "refund.approve",
      targetType: "Refund",
      targetId: refundId,
      before: { status: "pending" },
      after: { status: "processing", amountIdr: refund.amountIdr },
    });
  }, contendedTx);
}

/** Catat dana sudah benar-benar dikembalikan — wajib referensi transfer/bukti (FR-057). */
export async function markRefundSucceeded(
  db: PrismaClient,
  actor: StaffActor,
  input: { refundId: string; providerReference: string; evidenceKey?: string },
) {
  assertCan(actor, "refund.approve");
  if (input.providerReference.trim().length < 4) {
    throw new ValidationError([{ path: "providerReference", message: "Isi nomor referensi transfer/bukti refund." }]);
  }
  return db.$transaction(async (tx) => {
    const refund = await loadRefundLocked(tx, input.refundId);
    if (refund.status !== "processing") throw new RefundRuleError("bad_state", "Refund belum disetujui atau sudah final.");
    await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: "succeeded",
        providerReference: input.providerReference.trim(),
        evidenceKey: input.evidenceKey,
        succeededAt: new Date(),
      },
    });
    await syncOrderRefundState(tx, refund.orderId);
    await tx.notificationLog.createMany({
      data: [{ template: "refund_succeeded", orderId: refund.orderId, channel: "email", idempotencyKey: `refund-succeeded:${refund.id}` }],
      skipDuplicates: true,
    });
    await writeAudit(tx, {
      actor,
      action: "refund.succeeded",
      targetType: "Refund",
      targetId: refund.id,
      before: { status: "processing" },
      after: { status: "succeeded", amountIdr: refund.amountIdr },
    });
  }, contendedTx);
}

export async function markRefundFailed(db: PrismaClient, actor: StaffActor, input: { refundId: string; reason: string }) {
  assertCan(actor, "refund.approve");
  return db.$transaction(async (tx) => {
    const refund = await loadRefundLocked(tx, input.refundId);
    if (!["pending", "processing"].includes(refund.status)) {
      throw new RefundRuleError("bad_state", "Refund ini sudah final.");
    }
    await tx.refund.update({ where: { id: refund.id }, data: { status: "failed" } });
    await syncOrderRefundState(tx, refund.orderId);
    await writeAudit(tx, {
      actor,
      action: "refund.failed",
      targetType: "Refund",
      targetId: refund.id,
      before: { status: refund.status },
      after: { status: "failed" },
      reason: input.reason,
    });
  }, contendedTx);
}

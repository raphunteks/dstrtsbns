import "server-only";
import type { PrismaClient, ReturnStatus } from "@prisma/client";
import { z } from "zod";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { contendedTx } from "@/server/db/types";
import { DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";
import { applyStockAdjustment } from "@/server/modules/inventory/ledger";

/**
 * Retur (FR-053, BR-015, BR-019). Kebijakan retur final menunggu owner (OD-007), jadi modul ini
 * hanya menegakkan alur & jejak: requested → approved|rejected → received → inspected → closed.
 * Barang retur TIDAK otomatis jadi stok jual: hanya jumlah yang dinyatakan layak saat inspeksi.
 */

export class ReturnStateError extends DomainError {
  constructor(from: ReturnStatus, action: string) {
    super("return_bad_state", "Langkah retur ini tidak sah untuk status saat ini.", { from, action });
    this.name = "ReturnStateError";
  }
}

const itemsSchema = z
  .array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().positive() }))
  .min(1);

export async function openReturnRequest(
  db: PrismaClient,
  actor: StaffActor,
  input: { orderId: string; reason: string; items: { orderItemId: string; quantity: number }[]; evidenceKeys?: string[] },
) {
  assertCan(actor, "order.process");
  const items = itemsSchema.parse(input.items);
  if (input.reason.trim().length < 5) throw new ValidationError([{ path: "reason", message: "Alasan retur wajib diisi." }]);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { status: true, items: { select: { id: true, quantity: true } } },
    });
    if (!order) throw new NotFoundError("Order");
    if (!["shipped", "delivered", "completed"].includes(order.status)) {
      throw new ValidationError([{ path: "orderId", message: "Retur hanya untuk pesanan yang sudah dikirim." }]);
    }
    for (const item of items) {
      const line = order.items.find((i) => i.id === item.orderItemId);
      if (!line || item.quantity > line.quantity) {
        throw new ValidationError([{ path: "items", message: "Jumlah retur melebihi jumlah yang dibeli." }]);
      }
    }
    const request = await tx.returnRequest.create({
      data: { orderId: input.orderId, reason: input.reason.trim(), items, evidenceKeys: input.evidenceKeys ?? [] },
      select: { id: true },
    });
    await tx.order.update({ where: { id: input.orderId }, data: { status: "return_requested" } });
    await writeAudit(tx, { actor, action: "return.open", targetType: "ReturnRequest", targetId: request.id, after: { items } });
    return request;
  });
}

async function step(
  db: PrismaClient,
  actor: StaffActor,
  returnId: string,
  allowedFrom: ReturnStatus[],
  to: ReturnStatus,
  note?: string,
) {
  assertCan(actor, "order.process");
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findUnique({ where: { id: returnId } });
    if (!r) throw new NotFoundError("ReturnRequest");
    if (!allowedFrom.includes(r.status)) throw new ReturnStateError(r.status, to);
    await tx.returnRequest.update({
      where: { id: returnId },
      data: {
        status: to,
        ...(to === "approved" || to === "rejected"
          ? { decidedById: actor.userId, decidedAt: new Date(), decisionNote: note }
          : {}),
      },
    });
    if (to === "received") await tx.order.update({ where: { id: r.orderId }, data: { status: "returned" } });
    await writeAudit(tx, {
      actor,
      action: `return.${to}`,
      targetType: "ReturnRequest",
      targetId: returnId,
      before: { status: r.status },
      after: { status: to },
      reason: note,
    });
  });
}

export const decideReturn = (db: PrismaClient, actor: StaffActor, returnId: string, approve: boolean, note: string) =>
  step(db, actor, returnId, ["requested"], approve ? "approved" : "rejected", note);

export const markReturnReceived = (db: PrismaClient, actor: StaffActor, returnId: string) =>
  step(db, actor, returnId, ["approved", "in_transit"], "received");

/**
 * Inspeksi barang retur. `restock` per item = jumlah yang layak dijual lagi (ledger 'return_restock');
 * sisanya dianggap rusak/dibuang tanpa menyentuh stok jual (BR-015).
 */
export async function inspectReturn(
  db: PrismaClient,
  actor: StaffActor,
  input: { returnId: string; restock: { orderItemId: string; quantity: number }[]; note: string },
) {
  assertCan(actor, "order.process");
  return db.$transaction(async (tx) => {
    const r = await tx.returnRequest.findUnique({ where: { id: input.returnId } });
    if (!r) throw new NotFoundError("ReturnRequest");
    if (r.status !== "received") throw new ReturnStateError(r.status, "inspected");
    const requested = itemsSchema.parse(r.items);

    for (const line of input.restock) {
      if (line.quantity <= 0) continue;
      const req = requested.find((i) => i.orderItemId === line.orderItemId);
      if (!req || line.quantity > req.quantity) {
        throw new ValidationError([{ path: "restock", message: "Jumlah restock melebihi barang yang diretur." }]);
      }
      const item = await tx.orderItem.findUniqueOrThrow({
        where: { id: line.orderItemId },
        select: { variantId: true, fulfillmentModeSnap: true },
      });
      if (item.variantId && item.fulfillmentModeSnap === "ready_stock") {
        await applyStockAdjustment(tx, actor, {
          variantId: item.variantId,
          delta: line.quantity,
          reason: "return_restock",
          note: `Retur ${r.id}: ${input.note}`,
          referenceType: "return",
          referenceId: r.id,
        });
      }
    }
    await tx.returnRequest.update({ where: { id: r.id }, data: { status: "inspected", decisionNote: input.note } });
    await writeAudit(tx, {
      actor,
      action: "return.inspected",
      targetType: "ReturnRequest",
      targetId: r.id,
      after: { restock: input.restock },
      reason: input.note,
    });
  }, contendedTx);
}

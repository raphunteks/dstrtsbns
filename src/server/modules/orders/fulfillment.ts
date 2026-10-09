import "server-only";
import type { FulfillmentStatus, OrderStatus, PrismaClient } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { contendedTx, type Tx } from "@/server/db/types";
import { DomainError, NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";

/**
 * Alur pemenuhan pesanan oleh staf (FR-048–FR-050, FR-074–FR-076, FLOW-03).
 * Transisi hanya boleh dari status yang sah; status order dan status fulfillment diperbarui bersama
 * di satu transaksi dengan order terkunci, plus jejak audit (FR-060).
 */

export class IllegalTransitionError extends DomainError {
  constructor(action: string, from: { status: OrderStatus; fulfillmentStatus: FulfillmentStatus; paymentStatus: string }) {
    super("illegal_transition", "Tindakan ini tidak sah untuk status pesanan saat ini.", { action, ...from });
    this.name = "IllegalTransitionError";
  }
}

type Transition = {
  action: string;
  from: FulfillmentStatus[];
  to: FulfillmentStatus;
  orderStatus?: OrderStatus;
  orderFrom: OrderStatus[];
};

const TRANSITIONS = {
  /** Barang preorder/pemasok sudah ada di tangan toko. */
  markReadyToShip: {
    action: "fulfillment.ready_to_ship",
    from: ["awaiting_supply", "supplier_confirmed"],
    to: "ready_to_ship",
    orderFrom: ["paid", "processing"],
    orderStatus: "processing",
  },
  startPicking: {
    action: "fulfillment.picking",
    from: ["not_started", "ready_to_ship"],
    to: "picking",
    orderFrom: ["paid", "processing"],
    orderStatus: "processing",
  },
  markPacked: {
    action: "fulfillment.packed",
    from: ["picking"],
    to: "packed",
    orderFrom: ["processing"],
    orderStatus: "packed",
  },
  markDelivered: {
    action: "fulfillment.delivered",
    from: ["shipped"],
    to: "delivered",
    orderFrom: ["shipped"],
    orderStatus: "delivered",
  },
  /** Pemasok/produksi gagal memenuhi setelah dibayar (FR-075, BR-029). */
  reportException: {
    action: "fulfillment.exception",
    from: ["awaiting_supply", "supplier_confirmed", "ready_to_ship", "not_started", "picking"],
    to: "fulfillment_exception",
    orderFrom: ["paid", "processing"],
  },
} satisfies Record<string, Transition>;

export type TransitionName = keyof typeof TRANSITIONS;

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${orderId}::uuid FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, paymentStatus: true, fulfillmentStatus: true },
  });
  if (!order) throw new NotFoundError("Order");
  return order;
}

export async function applyFulfillmentTransition(
  tx: Tx,
  actor: StaffActor | null,
  orderId: string,
  name: TransitionName,
  note?: string,
) {
  const t: Transition = TRANSITIONS[name];
  const order = await lockOrder(tx, orderId);
  // Tidak ada pemrosesan barang untuk order yang belum lunas (FLOW-03, BR-012).
  if (
    order.paymentStatus !== "paid" ||
    !t.from.includes(order.fulfillmentStatus) ||
    !t.orderFrom.includes(order.status)
  ) {
    throw new IllegalTransitionError(t.action, order);
  }
  if (name === "reportException" && !note?.trim()) {
    throw new ValidationError([{ path: "note", message: "Jelaskan kendala pemenuhan." }]);
  }
  await tx.order.update({
    where: { id: orderId },
    data: {
      fulfillmentStatus: t.to,
      ...(t.orderStatus ? { status: t.orderStatus } : {}),
    },
  });
  if (name === "reportException") {
    await tx.fulfillmentCase.create({
      data: {
        orderId,
        mode: (await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { fulfillmentMode: true } }))
          .fulfillmentMode,
        status: "exception",
        ownerId: actor?.userId,
        note,
      },
    });
    await tx.notificationLog.createMany({
      data: [{ template: "fulfillment_exception", orderId, channel: "email", idempotencyKey: `fulfillment-exception:${orderId}` }],
      skipDuplicates: true,
    });
  }
  if (name === "markDelivered") {
    await tx.shipment.updateMany({
      where: { orderId, status: { in: ["requested", "picked_up", "in_transit"] } },
      data: { status: "delivered", deliveredAt: new Date() },
    });
  }
  await writeAudit(tx, {
    actor,
    action: t.action,
    targetType: "Order",
    targetId: orderId,
    before: { status: order.status, fulfillmentStatus: order.fulfillmentStatus },
    after: { status: t.orderStatus ?? order.status, fulfillmentStatus: t.to },
    reason: note,
  });
}

export async function transitionOrder(
  db: PrismaClient,
  actor: StaffActor,
  orderId: string,
  name: TransitionName,
  note?: string,
) {
  assertCan(actor, "order.process");
  return db.$transaction((tx) => applyFulfillmentTransition(tx, actor, orderId, name, note), contendedTx);
}

/** Resi: alfanumerik 8–40, tanpa spasi. Mencegah resi kosong/asal ketik (FR-050, AC-006). */
export const WAYBILL_PATTERN = /^[A-Z0-9-]{8,40}$/;

/**
 * Kirim lewat kurir manual (fallback resmi bila Komerce Delivery tidak aktif, FR-089, BR-041).
 * Order harus lunas dan sudah dikemas; resi wajib valid dan unik per kurir. Notifikasi "dikirim"
 * hanya diantrekan setelah resi tersimpan (BR-012, FR-076).
 */
export async function shipManually(
  db: PrismaClient,
  actor: StaffActor,
  input: { orderId: string; courierCode: string; serviceCode: string; waybill: string; costIdr: number },
) {
  assertCan(actor, "order.process");
  const waybill = input.waybill.trim().toUpperCase().replace(/\s+/g, "");
  if (!WAYBILL_PATTERN.test(waybill)) {
    throw new ValidationError([{ path: "waybill", message: "Nomor resi tidak valid (8–40 huruf/angka)." }]);
  }
  if (!Number.isSafeInteger(input.costIdr) || input.costIdr < 0) {
    throw new ValidationError([{ path: "costIdr", message: "Biaya kirim harus rupiah bulat." }]);
  }

  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.paymentStatus !== "paid" || order.fulfillmentStatus !== "packed" || order.status !== "packed") {
      throw new IllegalTransitionError("fulfillment.ship", order);
    }
    const exists = await tx.shipment.findFirst({
      where: { courierCode: input.courierCode.toLowerCase(), waybill },
      select: { id: true },
    });
    if (exists) throw new ValidationError([{ path: "waybill", message: "Resi ini sudah dipakai pesanan lain." }]);

    const now = new Date();
    const shipment = await tx.shipment.create({
      data: {
        orderId: input.orderId,
        mode: "manual_courier",
        courierCode: input.courierCode.toLowerCase(),
        serviceCode: input.serviceCode,
        costIdr: input.costIdr,
        waybill,
        status: "in_transit",
        shippedAt: now,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await tx.order.update({
      where: { id: input.orderId },
      data: { status: "shipped", fulfillmentStatus: "shipped" },
    });
    await tx.notificationLog.createMany({
      data: [{ template: "order_shipped", orderId: input.orderId, channel: "email", idempotencyKey: `order-shipped:${input.orderId}` }],
      skipDuplicates: true,
    });
    await writeAudit(tx, {
      actor,
      action: "fulfillment.shipped",
      targetType: "Order",
      targetId: input.orderId,
      before: { status: order.status, fulfillmentStatus: order.fulfillmentStatus },
      after: { status: "shipped", shipmentId: shipment.id, courier: input.courierCode, waybill, costIdr: input.costIdr },
    });
    return shipment;
  }, contendedTx);
}

/**
 * Selesaikan pesanan setelah diterima (BR-018). Aturan otomatis (N hari setelah delivered)
 * menunggu keputusan owner OD-012 — untuk sekarang hanya manual oleh staf.
 */
export async function completeOrder(db: PrismaClient, actor: StaffActor, orderId: string) {
  assertCan(actor, "order.process");
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "delivered") throw new IllegalTransitionError("order.complete", order);
    await tx.order.update({ where: { id: orderId }, data: { status: "completed", completedAt: new Date() } });
    await writeAudit(tx, {
      actor,
      action: "order.complete",
      targetType: "Order",
      targetId: orderId,
      before: { status: order.status },
      after: { status: "completed" },
    });
  });
}

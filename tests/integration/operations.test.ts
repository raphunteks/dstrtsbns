import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { LastSuperAdminError, setStaffRole, updateStoreSettings } from "@/server/modules/admin/settings";
import { dailyReconciliation } from "@/server/modules/finance/daily-reconciliation";
import { dashboardSummary, salesSummary } from "@/server/modules/finance/reports";
import { recordSupplierAvailability, upsertPreorderAllocation } from "@/server/modules/fulfillment/sources";
import { expireDueReservations } from "@/server/modules/inventory/reservations";
import { dispatchNotifications, type EmailSender } from "@/server/modules/notifications/dispatch";
import { cancelOrder } from "@/server/modules/orders/cancel";
import { completeOrder, IllegalTransitionError, shipManually, transitionOrder } from "@/server/modules/orders/fulfillment";
import { ExceptionResolutionError, resolvePaymentException } from "@/server/modules/payments/exceptions";
import {
  approveRefund,
  markRefundFailed,
  markRefundSucceeded,
  RefundRuleError,
  requestRefund,
} from "@/server/modules/refunds/service";
import { decideReturn, inspectReturn, markReturnReceived, openReturnRequest } from "@/server/modules/returns/service";
import { syncWaybills } from "@/server/modules/shipping/tracking";
import { createVariant, resetDb } from "./helpers";
import { APP_SECRET, fakeShipping, makePaidOrder, makePendingOrder, payOrder, setupStore, staff } from "./order-helpers";

afterAll(async () => {
  await db.$disconnect();
});

let ctx: Awaited<ReturnType<typeof setupStore>>;

beforeEach(async () => {
  await resetDb(db);
  ctx = await setupStore(db);
});

async function shipPaidOrder(orderId: string, waybill = "JNE0123456789") {
  await transitionOrder(db, staff.order, orderId, "startPicking");
  await transitionOrder(db, staff.order, orderId, "markPacked");
  return shipManually(db, staff.order, { orderId, courierCode: "jne", serviceCode: "REG", waybill, costIdr: 18000 });
}

describe("fulfillment (FLOW-03, AC-006)", () => {
  it("lunas → diproses → dikemas → dikirim (resi) → diterima → selesai, semua teraudit", async () => {
    const { orderId } = await makePaidOrder(db, ctx);
    await shipPaidOrder(orderId);
    await transitionOrder(db, staff.order, orderId, "markDelivered");
    await completeOrder(db, staff.order, orderId);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipments: true } });
    expect(order).toMatchObject({ status: "completed", fulfillmentStatus: "delivered" });
    expect(order.shipments[0]).toMatchObject({ mode: "manual_courier", waybill: "JNE0123456789", status: "delivered" });
    const actions = (await db.auditLog.findMany({ where: { targetId: orderId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(["fulfillment.picking", "fulfillment.packed", "fulfillment.shipped", "fulfillment.delivered", "order.complete"]),
    );
    expect(await db.notificationLog.count({ where: { orderId, template: "order_shipped" } })).toBe(1);
  });

  it("tidak bisa kirim order yang belum lunas / belum dikemas; resi kosong & ganda ditolak", async () => {
    const pending = await makePendingOrder(db, ctx);
    await expect(transitionOrder(db, staff.order, pending.orderId, "startPicking")).rejects.toBeInstanceOf(IllegalTransitionError);

    const { orderId } = await makePaidOrder(db, ctx);
    await expect(
      shipManually(db, staff.order, { orderId, courierCode: "jne", serviceCode: "REG", waybill: "JNE0123456789", costIdr: 18000 }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);

    await transitionOrder(db, staff.order, orderId, "startPicking");
    await transitionOrder(db, staff.order, orderId, "markPacked");
    await expect(
      shipManually(db, staff.order, { orderId, courierCode: "jne", serviceCode: "REG", waybill: "  ", costIdr: 18000 }),
    ).rejects.toBeInstanceOf(ValidationError);

    const other = await makePaidOrder(db, ctx);
    await shipPaidOrder(other.orderId, "JNE9999999999");
    await expect(
      shipManually(db, staff.order, { orderId, courierCode: "jne", serviceCode: "REG", waybill: "JNE9999999999", costIdr: 18000 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("izin dicek di server: finance tidak bisa mengirim, katalog tidak bisa refund (AC-009)", async () => {
    const { orderId } = await makePaidOrder(db, ctx);
    await expect(transitionOrder(db, staff.finance, orderId, "startPicking")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      requestRefund(db, staff.catalog, { orderId, amountIdr: 1000, reason: "uji izin", method: "manual_transfer" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("resi terlacak diterima → order delivered otomatis (FR-086)", async () => {
    const { orderId } = await makePaidOrder(db, ctx);
    await shipPaidOrder(orderId);
    const tracking = { ...fakeShipping, trackWaybill: async () => ({ delivered: true, status: "DELIVERED", podDate: null }) };
    await syncWaybills({ db, client: tracking });
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("delivered");
  });
});

describe("pembatalan (BR-013)", () => {
  it("sebelum bayar → hold dilepas; sesudah bayar → stok kembali + refund diajukan; sudah dikirim → ditolak", async () => {
    const pending = await makePendingOrder(db, ctx, { stock: 5 });
    await cancelOrder(db, staff.order, { orderId: pending.orderId, reason: "Pembeli minta batal" });
    expect(await db.productVariant.findUniqueOrThrow({ where: { id: pending.variantId } })).toMatchObject({
      stockOnHand: 5,
      stockReserved: 0,
    });

    const paid = await makePaidOrder(db, ctx, { stock: 5 });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: paid.variantId } })).stockOnHand).toBe(3);
    await cancelOrder(db, staff.order, { orderId: paid.orderId, reason: "Stok rusak saat dikemas" });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: paid.variantId } })).stockOnHand).toBe(5);
    expect(await db.inventoryLedger.count({ where: { variantId: paid.variantId, reason: "cancel_restock" } })).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: paid.orderId }, include: { refunds: true } });
    expect(order).toMatchObject({ status: "refund_pending", refundStatus: "pending" });
    expect(order.refunds[0]).toMatchObject({ amountIdr: 196000, status: "pending" });

    const shipped = await makePaidOrder(db, ctx);
    await shipPaidOrder(shipped.orderId);
    await expect(cancelOrder(db, staff.order, { orderId: shipped.orderId, reason: "terlambat" })).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });
});

describe("refund manual (FR-057, BR-014)", () => {
  it("pengaju ≠ penyetuju, sukses hanya dengan referensi, order ikut refunded", async () => {
    const { orderId } = await makePaidOrder(db, ctx);
    await cancelOrder(db, staff.order, { orderId, reason: "Pembeli minta batal" });
    const refund = await db.refund.findFirstOrThrow({ where: { orderId } });

    await expect(approveRefund(db, { ...staff.finance, userId: staff.order.userId }, refund.id)).rejects.toBeInstanceOf(
      RefundRuleError,
    );
    await approveRefund(db, staff.finance, refund.id);
    await expect(markRefundSucceeded(db, staff.finance, { refundId: refund.id, providerReference: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await markRefundSucceeded(db, staff.finance, { refundId: refund.id, providerReference: "TRF-BCA-20261010-001" });

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({ status: "refunded", refundStatus: "succeeded" });
  });

  it("refund tidak boleh melebihi dana yang diterima; gagal tidak dihitung sukses", async () => {
    const { orderId } = await makePaidOrder(db, ctx);
    await expect(
      requestRefund(db, staff.finance, { orderId, amountIdr: 196001, reason: "uji batas", method: "manual_transfer" }),
    ).rejects.toBeInstanceOf(RefundRuleError);

    const a = await requestRefund(db, staff.finance, { orderId, amountIdr: 100000, reason: "sebagian 1", method: "manual_transfer" });
    await expect(
      requestRefund(db, staff.finance, { orderId, amountIdr: 96001, reason: "sebagian 2", method: "manual_transfer" }),
    ).rejects.toBeInstanceOf(RefundRuleError);

    await markRefundFailed(db, staff.financeB, { refundId: a.id, reason: "rekening salah" });
    // Refund gagal membebaskan kuota lagi.
    await requestRefund(db, staff.finance, { orderId, amountIdr: 196000, reason: "ulang penuh", method: "manual_transfer" });
    expect(await db.refund.count({ where: { orderId, status: "succeeded" } })).toBe(0);
  });
});

describe("retur (FR-053, BR-015)", () => {
  it("hanya barang layak yang kembali jadi stok jual", async () => {
    const { orderId, variantId } = await makePaidOrder(db, ctx, { stock: 5 });
    await shipPaidOrder(orderId);
    await transitionOrder(db, staff.order, orderId, "markDelivered");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId } });

    const r = await openReturnRequest(db, staff.order, {
      orderId,
      reason: "Ukuran tidak sesuai",
      items: [{ orderItemId: item.id, quantity: 2 }],
    });
    await expect(markReturnReceived(db, staff.order, r.id)).rejects.toThrow(); // belum disetujui
    await decideReturn(db, staff.order, r.id, true, "Sesuai kebijakan");
    await markReturnReceived(db, staff.order, r.id);
    await inspectReturn(db, staff.order, { returnId: r.id, restock: [{ orderItemId: item.id, quantity: 1 }], note: "1 kotor" });

    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockOnHand).toBe(4); // 5 − 2 + 1
    expect(await db.inventoryLedger.count({ where: { variantId, reason: "return_restock" } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("returned");
  });
});

describe("pengecualian pembayaran (BR-011)", () => {
  it("proses bila stok masih ada; tolak bila habis lalu refund", async () => {
    const a = await makePendingOrder(db, ctx, { stock: 2 });
    await expireDueReservations(db, { now: new Date(Date.now() + 31 * 60_000) });
    expect(await payOrder(db, a.orderId)).toBe("payment_exception");

    await resolvePaymentException(db, staff.finance, { orderId: a.orderId, decision: "fulfill", note: "Stok masih ada" });
    expect(await db.order.findUniqueOrThrow({ where: { id: a.orderId } })).toMatchObject({ status: "paid", paymentStatus: "paid" });
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: a.variantId } })).stockOnHand).toBe(0);

    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 2 });
    const b = await makePendingOrder(db, ctx, { variantId: v.id });
    await expireDueReservations(db, { now: new Date(Date.now() + 31 * 60_000) });
    await makePaidOrder(db, ctx, { variantId: v.id }); // pembeli lain mengambil stok terakhir
    await payOrder(db, b.orderId);
    await expect(
      resolvePaymentException(db, staff.finance, { orderId: b.orderId, decision: "fulfill", note: "coba" }),
    ).rejects.toBeInstanceOf(ExceptionResolutionError);
    await resolvePaymentException(db, staff.finance, { orderId: b.orderId, decision: "refund", note: "Stok habis" });
    expect(await db.order.findUniqueOrThrow({ where: { id: b.orderId } })).toMatchObject({
      status: "refund_pending",
      refundStatus: "pending",
    });
  });
});

describe("laporan & rekonsiliasi (FR-041, FR-058)", () => {
  it("penjualan hanya dari order lunas; refund sukses mengurangi net; dashboard menghitung antrean", async () => {
    await makePendingOrder(db, ctx); // tidak dihitung
    const paid = await makePaidOrder(db, ctx);
    await makePaidOrder(db, ctx);

    const refund = await requestRefund(db, staff.order, { orderId: paid.orderId, amountIdr: 50000, reason: "kompensasi", method: "manual_transfer" });
    await approveRefund(db, staff.finance, refund.id);
    await markRefundSucceeded(db, staff.finance, { refundId: refund.id, providerReference: "TRF-001" });

    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const summary = await salesSummary(db, staff.finance, { from, to });
    expect(summary).toMatchObject({ paidOrders: 2, grossPaidIdr: 392000, refundedIdr: 50000, netIdr: 342000 });

    const dash = await dashboardSummary(db, staff.order);
    expect(dash).toMatchObject({ toProcess: 2, awaitingPayment: 1 });

    const recon = await dailyReconciliation(db);
    expect(recon.total).toBe(0);
  });
});

describe("notifikasi (§15, BR-022)", () => {
  it("terkirim sekali ke email pembeli; tanpa email ditandai, bukan diulang terus", async () => {
    const withEmail = await makePaidOrder(db, ctx);
    await makePaidOrder(db, ctx, { email: null });
    const sent: { to: string; subject: string }[] = [];
    const sender: EmailSender = { send: async (m) => void sent.push({ to: m.to, subject: m.subject }) };

    await dispatchNotifications({ db, sender, appUrl: "https://toko.test", appSecret: APP_SECRET });
    await dispatchNotifications({ db, sender, appUrl: "https://toko.test", appSecret: APP_SECRET });

    expect(sent.filter((s) => s.to === "sari@contoh.id")).toHaveLength(1);
    expect(sent.filter((s) => s.to === "admin@toko.test")).toHaveLength(2); // staff_order_ready ×2
    expect(await db.notificationLog.count({ where: { orderId: withEmail.orderId, outcome: "sent" } })).toBe(2);
    expect(await db.notificationLog.count({ where: { outcome: "failed", lastError: "no_recipient" } })).toBe(1);
  });

  it("penyedia email belum dikonfigurasi → antrean tetap utuh", async () => {
    await makePaidOrder(db, ctx);
    const r = await dispatchNotifications({ db, sender: null, appUrl: "https://toko.test", appSecret: APP_SECRET });
    expect(r).toMatchObject({ skipped: true, processed: 0 });
    expect(await db.notificationLog.count({ where: { outcome: "queued" } })).toBe(2);
  });
});

describe("pengaturan & peran (FR-059, FR-061)", () => {
  it("validasi pengaturan, audit, dan super admin terakhir tidak bisa dicabut", async () => {
    const owner = { userId: "00000000-0000-4000-8000-0000000000ff", roles: ["super_admin"] as const };
    await db.user.create({ data: { id: owner.userId, email: "owner@toko.test" } });
    await db.staffRole.create({ data: { userId: owner.userId, role: "super_admin" } });

    await expect(updateStoreSettings(db, owner, { paymentMethods: ["dana_va" as never] })).rejects.toBeInstanceOf(ValidationError);
    await updateStoreSettings(db, owner, { shippingCouriers: ["JNE", "sicepat", "jne"], reservationHoldMinutes: 45 });
    expect(await db.storeSettings.findUniqueOrThrow({ where: { id: 1 } })).toMatchObject({
      shippingCouriers: ["jne", "sicepat"],
      reservationHoldMinutes: 45,
    });
    await expect(updateStoreSettings(db, staff.order, { reservationHoldMinutes: 60 })).rejects.toBeInstanceOf(ForbiddenError);

    await expect(setStaffRole(db, owner, { userId: owner.userId, role: "super_admin", grant: false })).rejects.toBeInstanceOf(
      LastSuperAdminError,
    );
  });

  it("kuota preorder tidak bisa diturunkan di bawah yang sudah dipesan; komitmen pemasok harus masa depan", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, mode: "preorder" });
    await upsertPreorderAllocation(db, staff.catalog, v.id, {
      quotaTotal: 5, processingDaysMin: 5, processingDaysMax: 8, cutoffAt: null, policyNote: "Batal sebelum produksi: refund penuh.", active: true,
    });
    await db.preorderAllocation.update({ where: { variantId: v.id }, data: { quotaReserved: 3 } });
    await expect(
      upsertPreorderAllocation(db, staff.catalog, v.id, {
        quotaTotal: 2, processingDaysMin: 5, processingDaysMax: 8, cutoffAt: null, policyNote: "Batal sebelum produksi: refund penuh.", active: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const sv = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, mode: "supplier_fulfilled" });
    const supplier = await db.supplier.create({ data: { code: "SUP-1", name: "Pemasok", active: true } });
    await expect(
      recordSupplierAvailability(db, staff.order, {
        variantId: sv.id, supplierId: supplier.id, committedQty: 10, validUntil: new Date(Date.now() - 1000),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

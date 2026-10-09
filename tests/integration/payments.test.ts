import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import type { PakasirClient, PakasirMethod, PakasirStatus } from "@/server/integrations/pakasir/client";
import type { RajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";
import { getOrCreateCart, groupKey, setCartItemQuantity } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/checkout/place-order";
import { expireDueReservations } from "@/server/modules/inventory/reservations";
import { getBuyerOrderStatus } from "@/server/modules/payments/buyer-status";
import { reconcilePakasir } from "@/server/modules/payments/reconcile";
import { startPayment } from "@/server/modules/payments/start-payment";
import { PaymentNotAllowedError, type PaymentDeps } from "@/server/modules/payments/types";
import { receivePakasirWebhook } from "@/server/modules/payments/webhook";
import { createVariant, resetDb, seedBasics } from "./helpers";

const WEBHOOK_SECRET = "rahasia-webhook-uji-0123456789abcdef";
const APP_SECRET = "a".repeat(40);

/** Pakasir tiruan sesuai kontrak v2: create "find or create", status pending/completed/canceled. */
function fakePakasir() {
  const txns = new Map<string, PakasirStatus & { method: PakasirMethod }>();
  const byOrder = new Map<string, string>();
  const calls = { create: 0, status: 0, cancel: 0 };
  const client: PakasirClient = {
    async createTransaction({ providerOrderId, method, amountIdr }) {
      calls.create += 1;
      let txnId = byOrder.get(providerOrderId);
      if (!txnId) {
        txnId = `txn${randomUUID().slice(0, 8)}`;
        byOrder.set(providerOrderId, txnId);
        txns.set(txnId, { txn_id: txnId, order_id: providerOrderId, amount: amountIdr, is_sandbox: true, status: "pending", completed_at: null, method });
      }
      return {
        txnId,
        paymentUrl: method === "payment_link" ? `https://app.pakasir.com/pay-v2/${txnId}` : null,
        qrString: method === "qris" ? "000201010212" : null,
        vaNumber: null,
        feeIdr: null,
        totalPaymentIdr: null,
        expiresAt: null,
      };
    },
    async getStatus(txnId) {
      calls.status += 1;
      const t = txns.get(txnId);
      if (!t) throw new Error("not found");
      const { method: _method, ...status } = t;
      return status;
    },
    async cancel(txnId) {
      calls.cancel += 1;
      const t = txns.get(txnId);
      if (t && t.status === "pending") t.status = "canceled";
    },
  };
  return {
    client,
    calls,
    complete(txnId: string) {
      const t = txns.get(txnId)!;
      t.status = "completed";
      t.completed_at = new Date().toISOString();
      const { method: _method, ...payload } = t;
      return payload;
    },
    payloadFor(txnId: string) {
      const { method: _method, ...payload } = txns.get(txnId)!;
      return payload;
    },
  };
}

const shipping: RajaOngkirClient = {
  async searchDestinations() {
    return [];
  },
  async calculateDomesticCost({ courier }) {
    return [{ courierCode: courier, courierName: "JNE", serviceCode: "REG", description: null, costIdr: 18000, etd: "2-3" }];
  },
};

afterAll(async () => {
  await db.$disconnect();
});

let ctx: Awaited<ReturnType<typeof seedBasics>>;
let pakasir: ReturnType<typeof fakePakasir>;
let deps: PaymentDeps;

beforeEach(async () => {
  await resetDb(db);
  ctx = await seedBasics(db);
  await db.storeSettings.update({ where: { id: 1 }, data: { shippingCouriers: ["jne"] } });
  await db.fulfillmentSource.update({ where: { id: ctx.source.id }, data: { rajaongkirOriginId: "501" } });
  pakasir = fakePakasir();
  deps = {
    db,
    pakasir: pakasir.client,
    config: { slug: "dastertasbon", webhookSecret: WEBHOOK_SECRET, isSandbox: true, appUrl: "https://toko.test" },
  };
});

/** Order nyata lewat checkout: 2 × Rp89.000 + ongkir Rp18.000 = Rp196.000. */
async function makeOrder(stock = 3) {
  const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: stock });
  const { cart } = await getOrCreateCart(db, { token: null });
  await setCartItemQuantity(db, { cartId: cart.id, variantId: v.id, quantity: 2, mode: "add" });
  const order = await placeOrder(
    { db, shippingClient: shipping, appSecret: APP_SECRET },
    {
      cartId: cart.id,
      groupKey: groupKey("ready_stock", ctx.source.id),
      contact: { name: "Sari", phone: "081234567890", email: "sari@contoh.id" },
      address: {
        recipientName: "Sari",
        phone: "081234567890",
        provinceName: "Sulawesi Selatan",
        cityName: "Makassar",
        districtName: "Panakkukang",
        street: "Jl. Contoh No. 1",
        destinationId: "1234",
        destinationLabel: "PANAKKUKANG, MAKASSAR",
      },
      shipping: { courierCode: "jne", serviceCode: "REG" },
      expectedTotalIdr: 196000,
      idempotencyKey: randomUUID(),
    },
  );
  return { order, variant: v };
}

async function webhook(payload: object, secret = WEBHOOK_SECRET) {
  return receivePakasirWebhook(deps, { secretHeader: secret, rawBody: JSON.stringify(payload) });
}

describe("mulai pembayaran (FR-024, AC-016)", () => {
  it("nominal = total snapshot, attempt dipakai ulang, Pakasir dipanggil sekali", async () => {
    const { order } = await makeOrder();
    const first = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const second = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });

    expect(first.attemptId).toBe(second.attemptId);
    expect(first.amountIdr).toBe(196000);
    expect(pakasir.calls.create).toBe(1);
    expect(first.paymentUrl).toContain("redirect=https%3A%2F%2Ftoko.test%2Fpesanan%2F");
    const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: first.attemptId } });
    expect(attempt).toMatchObject({ providerOrderId: `${order.publicNumber}-1`, isSandbox: true, status: "pending" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).paymentStatus).toBe("pending");
  });

  it("metode yang belum diaktifkan atau Pakasir belum dikonfigurasi → ditolak", async () => {
    const { order } = await makeOrder();
    await expect(startPayment(deps, { orderId: order.orderId, method: "qris" })).rejects.toBeInstanceOf(PaymentNotAllowedError);
    await expect(
      startPayment({ ...deps, pakasir: null, config: null }, { orderId: order.orderId, method: "payment_link" }),
    ).rejects.toBeInstanceOf(PaymentNotAllowedError);
  });

  it("Pakasir gagal saat create → attempt tertinggal tanpa txn, percobaan berikutnya memakai order_id yang sama", async () => {
    const { order } = await makeOrder();
    const failing: PaymentDeps = {
      ...deps,
      pakasir: { ...pakasir.client, createTransaction: async () => Promise.reject(new Error("timeout")) },
    };
    await expect(startPayment(failing, { orderId: order.orderId, method: "payment_link" })).rejects.toThrow("timeout");
    const retry = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    expect(await db.paymentAttempt.count({ where: { orderId: order.orderId } })).toBe(1);
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: retry.attemptId } })).txnId).not.toBeNull();
  });
});

describe("webhook (FR-025, AC-003, AC-017)", () => {
  it("webhook sah → lunas sekali; webhook ulang tidak mengubah stok lagi", async () => {
    const { order, variant } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;
    const payload = pakasir.complete(txnId);

    expect(await webhook(payload)).toEqual({ httpStatus: 200, outcome: "paid" });
    const again = await webhook(payload);
    expect(again.httpStatus).toBe(200);

    const o = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(o).toMatchObject({ status: "paid", paymentStatus: "paid", fulfillmentStatus: "not_started" });
    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(v).toMatchObject({ stockOnHand: 1, stockReserved: 0 });
    expect(await db.inventoryLedger.count({ where: { variantId: variant.id, reason: "sale_committed" } })).toBe(1);
    expect(await db.paymentEvent.count({ where: { validation: "valid" } })).toBe(1);
    expect(await db.notificationLog.count({ where: { orderId: order.orderId, template: "order_paid" } })).toBe(1);
  });

  it("X-Secret salah → 401, tidak ada perubahan, tercatat", async () => {
    const { order } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;
    const payload = pakasir.complete(txnId);

    expect((await webhook(payload, "salah")).httpStatus).toBe(401);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("pending_payment");
    expect(await db.providerWebhookInbox.count({ where: { verified: false } })).toBe(1);
  });

  it("nominal atau sandbox tidak cocok → ditolak walau secret benar (BR-032)", async () => {
    const { order } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;
    const payload = pakasir.complete(txnId);

    expect(await webhook({ ...payload, amount: payload.amount - 1000 })).toMatchObject({ outcome: "mismatch" });
    expect(await webhook({ ...payload, is_sandbox: false })).toMatchObject({ outcome: "mismatch" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("pending_payment");
    expect(await webhook(payload)).toMatchObject({ outcome: "paid" }); // yang asli tetap diproses
  });

  it("secret bocor + payload palsu 'completed' tetapi status resmi masih pending → tidak lunas", async () => {
    const { order } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;
    const forged = { ...pakasir.payloadFor(txnId), status: "completed", completed_at: new Date().toISOString() };

    expect(await webhook(forged)).toMatchObject({ httpStatus: 200, outcome: "not_confirmed" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("pending_payment");

    // Webhook palsu tidak boleh "meracuni" webhook asli yang datang kemudian.
    expect(await webhook(pakasir.complete(txnId))).toMatchObject({ outcome: "paid" });
  });
});

describe("pembayaran terlambat (BR-004, BR-011, AC-005)", () => {
  it("dibayar setelah hold lepas → payment_exception, stok tidak disentuh", async () => {
    const { order, variant } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;

    await expireDueReservations(db, { now: new Date(Date.now() + 31 * 60_000) });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("expired");

    expect(await webhook(pakasir.complete(txnId))).toMatchObject({ outcome: "payment_exception" });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(o).toMatchObject({ status: "payment_exception", paymentStatus: "exception" });
    expect(await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).toMatchObject({
      stockOnHand: 3,
      stockReserved: 0,
    });
    expect(await db.auditLog.count({ where: { action: "payment.exception", targetId: order.orderId } })).toBe(1);
  });

  it("order kedaluwarsa dengan transaksi terbuka → dibatalkan di Pakasir oleh job (FR-082)", async () => {
    const { order } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    await expireDueReservations(db, { now: new Date(Date.now() + 31 * 60_000) });

    await reconcilePakasir(deps);
    expect(pakasir.calls.cancel).toBe(1);
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).status).toBe("canceled");
  });
});

describe("status pembeli & rekonsiliasi (AC-020, FR-081)", () => {
  it("kembali dari Pakasir sebelum webhook → 'Menunggu verifikasi' sampai status resmi completed", async () => {
    const { order } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;

    const waiting = await getBuyerOrderStatus(deps, order.orderId);
    expect(waiting.label).toBe("Menunggu verifikasi pembayaran");

    pakasir.complete(txnId);
    const callsBefore = pakasir.calls.status;
    const throttled = await getBuyerOrderStatus(deps, order.orderId); // < 4 detik sejak cek terakhir
    expect(pakasir.calls.status).toBe(callsBefore);
    expect(throttled.status).toBe("pending_payment");

    const later = { ...deps, now: () => new Date(Date.now() + 5_000) };
    const paid = await getBuyerOrderStatus(later, order.orderId);
    expect(paid).toMatchObject({ status: "paid", label: "Pembayaran terkonfirmasi" });
  });

  it("webhook hilang → job rekonsiliasi menandai lunas", async () => {
    const { order } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;
    pakasir.complete(txnId);

    await reconcilePakasir({ ...deps, now: () => new Date(Date.now() + 2 * 60_000) });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("paid");
  });

  it("webhook + polling bersamaan → tetap satu kali lunas", async () => {
    const { order, variant } = await makeOrder();
    const pay = await startPayment(deps, { orderId: order.orderId, method: "payment_link" });
    const txnId = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: pay.attemptId } })).txnId!;
    const payload = pakasir.complete(txnId);

    await Promise.all([
      webhook(payload),
      webhook(payload),
      getBuyerOrderStatus({ ...deps, now: () => new Date(Date.now() + 5_000) }, order.orderId),
    ]);
    expect(await db.inventoryLedger.count({ where: { variantId: variant.id, reason: "sale_committed" } })).toBe(1);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockOnHand).toBe(1);
  });
});

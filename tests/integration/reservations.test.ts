import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { contendedTx } from "@/server/db/types";
import { InsufficientAvailabilityError, MixedFulfillmentGroupError, NotPurchasableError } from "@/server/modules/inventory/errors";
import {
  commitForOrder,
  expireDueReservations,
  releaseForOrder,
  reserveForOrder,
} from "@/server/modules/inventory/reservations";
import { getFeatureFlags } from "@/server/modules/settings/feature-flags";
import { createPendingOrder, createVariant, resetDb, seedBasics } from "./helpers";

afterAll(async () => {
  await db.$disconnect();
});

let ctx: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb(db);
  ctx = await seedBasics(db);
});

async function reserve(orderId: string, variantId: string, quantity: number, expiresAt?: Date) {
  const flags = await getFeatureFlags(db);
  return db.$transaction(
    (tx) =>
      reserveForOrder(tx, {
        orderId,
        expiresAt: expiresAt ?? new Date(Date.now() + 30 * 60_000),
        lines: [{ variantId, quantity }],
        flags,
      }),
    contendedTx,
  );
}

describe("AC-004: rebutan unit terakhir", () => {
  it("50 checkout paralel ke SKU stok 1 → tepat satu reservasi, stok tidak negatif", async () => {
    const variant = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 1 });
    const orders = await Promise.all(
      Array.from({ length: 50 }, () => createPendingOrder(db, { sourceId: ctx.source.id })),
    );

    const results = await Promise.allSettled(orders.map((o) => reserve(o.id, variant.id, 1)));

    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(49);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(InsufficientAvailabilityError);

    const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stockOnHand).toBe(1);
    expect(after.stockReserved).toBe(1);
    expect(await db.stockReservation.count({ where: { variantId: variant.id } })).toBe(1);
  });

  it("stok 3, 20 pembeli masing-masing 1 → tepat 3 berhasil", async () => {
    const variant = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const orders = await Promise.all(
      Array.from({ length: 20 }, () => createPendingOrder(db, { sourceId: ctx.source.id })),
    );
    const results = await Promise.allSettled(orders.map((o) => reserve(o.id, variant.id, 1)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(after.stockReserved).toBe(3);
  });
});

describe("aturan pembelian", () => {
  it("produk draft tidak bisa dipesan walau lewat panggilan langsung (FR-005, BR-002)", async () => {
    const variant = await createVariant(db, {
      categoryId: ctx.category.id,
      sourceId: ctx.source.id,
      stockOnHand: 5,
      published: false,
    });
    const order = await createPendingOrder(db, { sourceId: ctx.source.id });
    await expect(reserve(order.id, variant.id, 1)).rejects.toBeInstanceOf(NotPurchasableError);
  });

  it("satu order tidak boleh mencampur asal kirim (BR-025)", async () => {
    const otherSource = await db.fulfillmentSource.create({
      data: { code: "SRC-LAIN", name: "Gudang lain", type: "own_warehouse", originLabel: "Lain", originAddress: {}, active: true },
    });
    const a = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 5 });
    const b = await createVariant(db, { categoryId: ctx.category.id, sourceId: otherSource.id, stockOnHand: 5 });
    const order = await createPendingOrder(db, { sourceId: ctx.source.id });
    const flags = await getFeatureFlags(db);

    await expect(
      db.$transaction((tx) =>
        reserveForOrder(tx, {
          orderId: order.id,
          expiresAt: new Date(Date.now() + 60_000),
          lines: [
            { variantId: a.id, quantity: 1 },
            { variantId: b.id, quantity: 1 },
          ],
          flags,
        }),
      ),
    ).rejects.toBeInstanceOf(MixedFulfillmentGroupError);

    const [va, vb] = await Promise.all([
      db.productVariant.findUniqueOrThrow({ where: { id: a.id } }),
      db.productVariant.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(va.stockReserved + vb.stockReserved).toBe(0);
  });

  it("database menolak reservasi melebihi stok meski kode dilewati (CHECK constraint)", async () => {
    const variant = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 1 });
    await expect(
      db.productVariant.update({ where: { id: variant.id }, data: { stockReserved: 2 } }),
    ).rejects.toThrow();
  });
});

describe("AC-005: kedaluwarsa & pelepasan idempoten", () => {
  it("job dijalankan dua kali → stok dilepas sekali, order menjadi expired", async () => {
    const variant = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 2 });
    const past = new Date(Date.now() - 60_000);
    const order = await createPendingOrder(db, { sourceId: ctx.source.id, reservationExpiresAt: past });
    await reserve(order.id, variant.id, 2, past);

    const first = await expireDueReservations(db);
    const second = await expireDueReservations(db);
    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
    expect(second.remaining).toBe(0);

    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(v.stockReserved).toBe(0);
    expect(v.stockOnHand).toBe(2);
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("expired");
  });

  it("pembayaran setelah hold lepas tidak mengonversi apa pun → pemanggil harus payment_exception (BR-011)", async () => {
    const variant = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 1 });
    const order = await createPendingOrder(db, { sourceId: ctx.source.id });
    await reserve(order.id, variant.id, 1);
    await db.$transaction((tx) => releaseForOrder(tx, order.id, "released"));

    const converted = await db.$transaction((tx) => commitForOrder(tx, order.id));
    expect(converted).toBe(0);
    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(v).toMatchObject({ stockOnHand: 1, stockReserved: 0 });
  });

  it("pembayaran tepat waktu mengurangi stok fisik sekali + ledger", async () => {
    const variant = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const order = await createPendingOrder(db, { sourceId: ctx.source.id });
    await reserve(order.id, variant.id, 2);

    expect(await db.$transaction((tx) => commitForOrder(tx, order.id))).toBe(1);
    expect(await db.$transaction((tx) => commitForOrder(tx, order.id))).toBe(0); // webhook ganda

    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(v).toMatchObject({ stockOnHand: 1, stockReserved: 0 });
    const ledger = await db.inventoryLedger.findMany({ where: { variantId: variant.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: -2, reason: "sale_committed", referenceId: order.id });
  });
});

describe("mode preorder & pemasok", () => {
  it("kuota preorder tidak bisa terlampaui oleh checkout bersamaan", async () => {
    const variant = await createVariant(db, {
      categoryId: ctx.category.id,
      sourceId: ctx.source.id,
      mode: "preorder",
    });
    await db.preorderAllocation.create({
      data: {
        variantId: variant.id,
        quotaTotal: 1,
        processingDaysMin: 5,
        processingDaysMax: 8,
        policyNote: "Uji",
        active: true,
      },
    });
    const orders = await Promise.all(
      Array.from({ length: 10 }, () => createPendingOrder(db, { sourceId: ctx.source.id })),
    );
    const results = await Promise.allSettled(orders.map((o) => reserve(o.id, variant.id, 1)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const alloc = await db.preorderAllocation.findUniqueOrThrow({ where: { variantId: variant.id } });
    expect(alloc.quotaReserved).toBe(1);
  });

  it("komitmen pemasok yang habis sebelum hold berakhir ditolak (BR-028)", async () => {
    const variant = await createVariant(db, {
      categoryId: ctx.category.id,
      sourceId: ctx.source.id,
      mode: "supplier_fulfilled",
    });
    const supplier = await db.supplier.create({ data: { code: "SUP-UJI", name: "Pemasok uji", active: true } });
    await db.supplierAvailability.create({
      data: {
        variantId: variant.id,
        supplierId: supplier.id,
        committedQty: 5,
        validUntil: new Date(Date.now() + 10 * 60_000), // berlaku 10 menit
        lastCheckedAt: new Date(),
      },
    });
    const order = await createPendingOrder(db, { sourceId: ctx.source.id });
    // hold 30 menit > masa berlaku komitmen → tolak
    await expect(reserve(order.id, variant.id, 1)).rejects.toBeInstanceOf(InsufficientAvailabilityError);
    // hold 5 menit → boleh, dan pelepasan mengembalikan komitmen
    const ok = await reserve(order.id, variant.id, 2, new Date(Date.now() + 5 * 60_000));
    expect(ok.mode).toBe("supplier_fulfilled");
    await db.$transaction((tx) => releaseForOrder(tx, order.id, "released"));
    const avail = await db.supplierAvailability.findFirstOrThrow({ where: { variantId: variant.id } });
    expect(avail.reservedQty).toBe(0);
  });
});

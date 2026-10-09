import { randomUUID } from "node:crypto";
import type { FulfillmentMode, PrismaClient } from "@prisma/client";

/** Kosongkan semua tabel aplikasi di schema "app". */
export async function resetDb(db: PrismaClient) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"app"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export async function seedBasics(db: PrismaClient) {
  await db.storeSettings.create({
    data: {
      id: 1,
      featureFlags: { ready_stock: true, preorder: true, supplier_fulfilled: true, komerce_delivery: false },
    },
  });
  const category = await db.category.create({
    data: { name: "Daster", slug: `daster-${randomUUID().slice(0, 8)}` },
  });
  const source = await db.fulfillmentSource.create({
    data: {
      code: `SRC-${randomUUID().slice(0, 8)}`,
      name: "Gudang uji",
      type: "own_warehouse",
      originLabel: "Gudang uji",
      originAddress: {},
      active: true,
    },
  });
  return { category, source };
}

export async function createVariant(
  db: PrismaClient,
  opts: {
    categoryId: string;
    sourceId: string;
    stockOnHand?: number;
    mode?: FulfillmentMode;
    published?: boolean;
  },
) {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const product = await db.product.create({
    data: {
      name: `Produk uji ${suffix}`,
      slug: `produk-uji-${suffix.toLowerCase()}`,
      description: "Produk untuk uji integrasi.",
      categoryId: opts.categoryId,
      status: opts.published === false ? "draft" : "published",
      publishedAt: new Date(),
    },
  });
  return db.productVariant.create({
    data: {
      productId: product.id,
      sku: `UJI-${suffix}`,
      attributes: { ukuran: "All Size" },
      attributeKey: "ukuran=all size",
      priceIdr: 89000,
      weightGrams: 300,
      fulfillmentMode: opts.mode ?? "ready_stock",
      fulfillmentSourceId: opts.sourceId,
      stockOnHand: opts.stockOnHand ?? 0,
    },
  });
}

/** Order minimal berstatus pending_payment (checkout sungguhan dibuat di Fase 3). */
export async function createPendingOrder(
  db: PrismaClient,
  opts: { sourceId: string; reservationExpiresAt?: Date },
) {
  return db.order.create({
    data: {
      publicNumber: `DTS-${randomUUID().slice(0, 10).toUpperCase()}`,
      contact: { name: "Pembeli Uji" },
      shippingAddress: { city: "Kota Uji" },
      fulfillmentMode: "ready_stock",
      fulfillmentSourceId: opts.sourceId,
      processingDaysMin: 1,
      processingDaysMax: 2,
      itemsSubtotalIdr: 89000,
      shippingIdr: 18000,
      grandTotalIdr: 107000,
      idempotencyKey: randomUUID(),
      reservationExpiresAt: opts.reservationExpiresAt ?? new Date(Date.now() + 30 * 60_000),
    },
  });
}

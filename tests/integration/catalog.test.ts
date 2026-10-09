import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { StaffActor } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createProduct, saveVariant, setProductStatus } from "@/server/modules/catalog/commands";
import { getPublishedProductBySlug, listProducts } from "@/server/modules/catalog/queries";
import { listingParamsSchema } from "@/server/modules/catalog/schemas";
import { adjustStock } from "@/server/modules/inventory/ledger";
import { StockAdjustmentRejectedError } from "@/server/modules/inventory/errors";
import { resetDb, seedBasics } from "./helpers";

const catalogAdmin: StaffActor = { userId: "00000000-0000-4000-8000-0000000000aa", roles: ["admin_catalog"] };
const finance: StaffActor = { userId: "00000000-0000-4000-8000-0000000000bb", roles: ["admin_finance"] };

afterAll(async () => {
  await db.$disconnect();
});

let ctx: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb(db);
  ctx = await seedBasics(db);
  await db.category.update({
    where: { id: ctx.category.id },
    data: { slug: "daster", attributeSchema: { requiredVariantAttributes: ["ukuran"] } },
  });
});

async function makeProduct(name = "Daster Rayon Harian") {
  const product = await createProduct(db, catalogAdmin, {
    name,
    description: "Daster rayon adem untuk aktivitas harian di rumah, potongan longgar.",
    material: "Rayon",
    careInstructions: "Cuci tangan.",
    sizeChart: { columns: ["Ukuran", "LD (cm)"], rows: [["All Size", "110"]] },
    categoryId: ctx.category.id,
  });
  await db.mediaAsset.create({
    data: { productId: product.id, objectKey: "uji/daster.jpg", altText: "Daster motif bunga navy" },
  });
  return product;
}

describe("perintah katalog", () => {
  it("staf tanpa izin katalog ditolak di server (AC-009 pola yang sama)", async () => {
    await expect(
      createProduct(db, finance, {
        name: "Coba",
        description: "x",
        categoryId: ctx.category.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("produk tidak bisa terbit sebelum lengkap, lalu bisa setelah varian ditambah", async () => {
    const product = await makeProduct();
    await expect(setProductStatus(db, catalogAdmin, product.id, "published")).rejects.toBeInstanceOf(
      ValidationError,
    );

    await saveVariant(db, catalogAdmin, product.id, {
      sku: "dts-da-001-bunga",
      attributes: { ukuran: "All Size", motif: "Bunga" },
      priceIdr: 89000,
      weightGrams: 300,
      fulfillmentSourceId: ctx.source.id,
    });
    await setProductStatus(db, catalogAdmin, product.id, "published");

    const saved = await db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(saved).toMatchObject({ status: "published", minPriceIdr: 89000, maxPriceIdr: 89000 });
    expect(await db.auditLog.count({ where: { targetId: product.id } })).toBeGreaterThanOrEqual(2);
  });

  it("SKU dan kombinasi atribut ganda ditolak dengan pesan jelas (FR-044)", async () => {
    const product = await makeProduct();
    const base = {
      attributes: { ukuran: "L", warna: "Navy" },
      priceIdr: 89000,
      weightGrams: 300,
      fulfillmentSourceId: ctx.source.id,
    };
    await saveVariant(db, catalogAdmin, product.id, { ...base, sku: "SKU-001" });
    await expect(
      saveVariant(db, catalogAdmin, product.id, { ...base, sku: "SKU-001", attributes: { ukuran: "XL" } }),
    ).rejects.toMatchObject({ details: { issues: [{ path: "sku" }] } });
    await expect(
      saveVariant(db, catalogAdmin, product.id, { ...base, sku: "SKU-002", attributes: { warna: "navy", ukuran: "l" } }),
    ).rejects.toMatchObject({ details: { issues: [{ path: "attributes" }] } });
  });
});

describe("query katalog publik", () => {
  it("produk draft/arsip tidak muncul dan tidak bisa dibuka lewat slug (FR-005)", async () => {
    const product = await makeProduct();
    await saveVariant(db, catalogAdmin, product.id, {
      sku: "SKU-A",
      attributes: { ukuran: "L" },
      priceIdr: 99000,
      weightGrams: 300,
      fulfillmentSourceId: ctx.source.id,
    });
    expect(await getPublishedProductBySlug(db, product.slug)).toBeNull();
    await setProductStatus(db, catalogAdmin, product.id, "published");
    expect(await getPublishedProductBySlug(db, product.slug)).not.toBeNull();
    await setProductStatus(db, catalogAdmin, product.id, "archived");
    expect(await getPublishedProductBySlug(db, product.slug)).toBeNull();
  });

  it("filter tersedia, ukuran, harga, dan urutan termurah", async () => {
    const cheap = await makeProduct("Daster Murah");
    const pricey = await makeProduct("Daster Mahal");
    const v1 = await saveVariant(db, catalogAdmin, cheap.id, {
      sku: "SKU-MURAH", attributes: { ukuran: "L" }, priceIdr: 79000, weightGrams: 300, fulfillmentSourceId: ctx.source.id,
    });
    await saveVariant(db, catalogAdmin, pricey.id, {
      sku: "SKU-MAHAL", attributes: { ukuran: "XL" }, priceIdr: 149000, weightGrams: 300, fulfillmentSourceId: ctx.source.id,
    });
    await setProductStatus(db, catalogAdmin, cheap.id, "published");
    await setProductStatus(db, catalogAdmin, pricey.id, "published");
    await adjustStock(db, catalogAdmin, { variantId: v1.id, delta: 5, reason: "stock_in" });

    const all = await listProducts(db, listingParamsSchema.parse({ urut: "termurah" }));
    expect(all.items.map((i) => i.name)).toEqual(["Daster Murah", "Daster Mahal"]);
    expect(all.items[0]).toMatchObject({ purchasable: true, modes: ["ready_stock"], sizes: ["L"] });
    expect(all.items[1]).toMatchObject({ purchasable: false });

    const available = await listProducts(db, listingParamsSchema.parse({ tersedia: "1" }));
    expect(available.items.map((i) => i.name)).toEqual(["Daster Murah"]);

    const xl = await listProducts(db, listingParamsSchema.parse({ ukuran: "XL" }));
    expect(xl.items.map((i) => i.name)).toEqual(["Daster Mahal"]);

    const range = await listProducts(db, listingParamsSchema.parse({ min: "100000" }));
    expect(range.items.map((i) => i.name)).toEqual(["Daster Mahal"]);

    const search = await listProducts(db, listingParamsSchema.parse({ q: "murah" }));
    expect(search.total).toBe(1);
  });
});

describe("ledger stok (FR-045)", () => {
  it("stok tidak boleh negatif atau di bawah reservasi, setiap perubahan tercatat", async () => {
    const product = await makeProduct();
    const variant = await saveVariant(db, catalogAdmin, product.id, {
      sku: "SKU-LEDGER", attributes: { ukuran: "L" }, priceIdr: 89000, weightGrams: 300, fulfillmentSourceId: ctx.source.id,
    });
    await adjustStock(db, catalogAdmin, { variantId: variant.id, delta: 3, reason: "stock_in" });
    await db.productVariant.update({ where: { id: variant.id }, data: { stockReserved: 2 } });

    await expect(
      adjustStock(db, catalogAdmin, { variantId: variant.id, delta: -2, reason: "damaged" }),
    ).rejects.toBeInstanceOf(StockAdjustmentRejectedError);
    await expect(
      adjustStock(db, catalogAdmin, { variantId: variant.id, delta: -1, reason: "correction" }),
    ).rejects.toBeInstanceOf(ValidationError); // koreksi wajib alasan
    await adjustStock(db, catalogAdmin, { variantId: variant.id, delta: -1, reason: "correction", note: "Hitung ulang rak" });

    const v = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(v.stockOnHand).toBe(2);
    const ledger = await db.inventoryLedger.findMany({ where: { variantId: variant.id }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((l) => [l.delta, l.reason])).toEqual([
      [3, "stock_in"],
      [-1, "correction"],
    ]);
    expect(await db.auditLog.count({ where: { action: "stock.adjust", targetId: variant.id } })).toBe(2);

    await expect(
      adjustStock(db, finance, { variantId: variant.id, delta: 1, reason: "stock_in" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

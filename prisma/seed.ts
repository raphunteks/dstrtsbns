/**
 * Seed DATA CONTOH untuk pengembangan dan desain (PRD Lampiran A, DESIGN.md §13.2).
 * Semua nama, harga, dan stok FIKTIF. Jangan dijalankan di database produksi.
 *
 *   pnpm db:seed
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DUMMY_NOTE = "Data contoh — bukan produk, harga, atau stok nyata.";

const sizeChartDaster = {
  columns: ["Ukuran", "Lingkar dada (cm)", "Panjang (cm)"],
  rows: [["All Size", "110", "105"]],
  note: DUMMY_NOTE,
};

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW !== "1") {
    throw new Error("Seed ditolak di production. Set SEED_ALLOW=1 bila memang disengaja.");
  }

  await db.storeSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const source = await db.fulfillmentSource.upsert({
    where: { code: "GUDANG-UTAMA" },
    update: {},
    create: {
      code: "GUDANG-UTAMA",
      name: "Gudang utama (contoh)",
      type: "own_warehouse",
      originLabel: "Dikirim dari gudang toko",
      originAddress: { note: "Alamat asal kirim menunggu keputusan owner (OD-004)" },
      processingDaysMin: 1,
      processingDaysMax: 2,
      active: true,
    },
  });

  const categories = [
    { slug: "daster", name: "Daster", sortOrder: 1, required: ["ukuran"] },
    { slug: "setelan-rumah", name: "Setelan Rumah", sortOrder: 2, required: ["ukuran"] },
    { slug: "piyama", name: "Piyama", sortOrder: 3, required: ["ukuran"] },
    { slug: "tunik-santai", name: "Tunik / Santai", sortOrder: 4, required: ["ukuran"] },
  ];
  const categoryBySlug = new Map<string, string>();
  for (const c of categories) {
    const row = await db.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        name: c.name,
        sortOrder: c.sortOrder,
        attributeSchema: { requiredVariantAttributes: c.required, requireSizeChart: true, requireMaterial: true },
      },
    });
    categoryBySlug.set(c.slug, row.id);
  }

  const products = [
    {
      slug: "daster-rayon-harian",
      name: "Daster Rayon Harian",
      category: "daster",
      material: "Rayon",
      variants: [
        { sku: "DTS-DA-001-BUNGA", attributes: { motif: "Bunga", ukuran: "All Size" }, price: 89000, stock: 12 },
        { sku: "DTS-DA-001-DAUN", attributes: { motif: "Daun", ukuran: "All Size" }, price: 89000, stock: 0 },
      ],
    },
    {
      slug: "daster-jumbo-santai",
      name: "Daster Jumbo Santai",
      category: "daster",
      material: "Rayon",
      variants: [
        { sku: "DTS-DJ-002-NAVY-XL", attributes: { warna: "Navy", ukuran: "XL" }, price: 119000, stock: 7 },
      ],
    },
    {
      slug: "tunik-santai-rayon",
      name: "Tunik Santai Rayon",
      category: "tunik-santai",
      material: "Rayon",
      variants: [
        { sku: "DTS-TN-004-PINK-L", attributes: { warna: "Dusty Pink", ukuran: "L" }, price: 119000, stock: 4 },
      ],
    },
  ];

  for (const p of products) {
    const product = await db.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        name: p.name,
        description: `${p.name} untuk aktivitas dan istirahat di rumah. ${DUMMY_NOTE}`,
        material: p.material,
        careInstructions: "Cuci dengan tangan, jangan diperas kuat, jemur di tempat teduh.",
        sizeChart: sizeChartDaster,
        categoryId: categoryBySlug.get(p.category)!,
        status: "published",
        publishedAt: new Date(),
        minPriceIdr: Math.min(...p.variants.map((v) => v.price)),
        maxPriceIdr: Math.max(...p.variants.map((v) => v.price)),
        media: {
          create: [{ objectKey: `contoh/${p.slug}.jpg`, altText: `${p.name}, foto contoh`, sortOrder: 0 }],
        },
      },
    });

    for (const v of p.variants) {
      const existing = await db.productVariant.findUnique({ where: { sku: v.sku } });
      if (existing) continue;
      const key = Object.entries(v.attributes as Record<string, string>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => `${k}=${value.toLowerCase()}`)
        .join("|");
      const variant = await db.productVariant.create({
        data: {
          productId: product.id,
          sku: v.sku,
          attributes: v.attributes,
          attributeKey: key,
          priceIdr: v.price,
          weightGrams: 300,
          fulfillmentMode: "ready_stock",
          fulfillmentSourceId: source.id,
          stockOnHand: v.stock,
        },
      });
      if (v.stock > 0) {
        await db.inventoryLedger.create({
          data: { variantId: variant.id, delta: v.stock, reason: "initial_count", note: DUMMY_NOTE },
        });
      }
    }
  }

  console.log("Seed contoh selesai.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

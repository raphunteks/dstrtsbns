import "server-only";
import type { FulfillmentMode, Prisma } from "@prisma/client";
import type { Db } from "@/server/db/types";
import { computeAvailability, type Availability } from "@/server/modules/inventory/availability";
import { getFeatureFlags, type FeatureFlags } from "@/server/modules/settings/feature-flags";
import type { ListingParams } from "./schemas";

export const PAGE_SIZE = 24;

/** Bagian varian yang dibutuhkan untuk menghitung ketersediaan. */
const variantAvailabilitySelect = {
  id: true,
  sku: true,
  attributes: true,
  priceIdr: true,
  compareAtPriceIdr: true,
  weightGrams: true,
  status: true,
  fulfillmentMode: true,
  stockOnHand: true,
  stockReserved: true,
  preorderAllocation: {
    select: {
      active: true,
      quotaTotal: true,
      quotaReserved: true,
      cutoffAt: true,
      processingDaysMin: true,
      processingDaysMax: true,
    },
  },
  supplierAvailability: {
    where: { validUntil: { gt: new Date(0) } }, // diganti per-query dengan waktu sekarang
    select: { committedQty: true, reservedQty: true, validUntil: true },
  },
  fulfillmentSource: {
    select: { originLabel: true, processingDaysMin: true, processingDaysMax: true },
  },
} satisfies Prisma.ProductVariantSelect;

type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof variantAvailabilitySelect }>;

function variantSelect(now: Date) {
  return {
    ...variantAvailabilitySelect,
    supplierAvailability: {
      ...variantAvailabilitySelect.supplierAvailability,
      where: { validUntil: { gt: now } },
    },
  } satisfies Prisma.ProductVariantSelect;
}

function availabilityOf(v: VariantRow, productPublished: boolean, flags: FeatureFlags, now: Date) {
  return computeAvailability(
    {
      mode: v.fulfillmentMode,
      productPublished,
      variantActive: v.status === "active",
      stockOnHand: v.stockOnHand,
      stockReserved: v.stockReserved,
      preorder: v.preorderAllocation,
      supplierCommitments: v.supplierAvailability,
    },
    flags,
    now,
  );
}

/** ID produk yang punya minimal satu varian bisa dibeli sekarang (filter "tersedia"). */
async function purchasableProductIds(db: Db, flags: FeatureFlags): Promise<string[]> {
  const rows = await db.$queryRaw<{ productId: string }[]>`
    SELECT DISTINCT v."productId"
      FROM "app"."ProductVariant" v
      LEFT JOIN "app"."PreorderAllocation" p ON p."variantId" = v."id"
     WHERE v."status" = 'active'
       AND (
         (v."fulfillmentMode" = 'ready_stock' AND ${flags.ready_stock}
            AND v."stockOnHand" - v."stockReserved" > 0)
      OR (v."fulfillmentMode" = 'preorder' AND ${flags.preorder}
            AND p."active" AND p."quotaTotal" - p."quotaReserved" > 0
            AND (p."cutoffAt" IS NULL OR p."cutoffAt" > now()))
      OR (v."fulfillmentMode" = 'supplier_fulfilled' AND ${flags.supplier_fulfilled}
            AND EXISTS (
              SELECT 1 FROM "app"."SupplierAvailability" s
               WHERE s."variantId" = v."id" AND s."validUntil" > now()
                 AND s."committedQty" - s."reservedQty" > 0))
       )`;
  return rows.map((r) => r.productId);
}

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  minPriceIdr: number | null;
  maxPriceIdr: number | null;
  image: { objectKey: string; altText: string } | null;
  purchasable: boolean;
  modes: FulfillmentMode[];
  sizes: string[];
};

/** Listing katalog / hasil pencarian (FR-002–FR-005). Hanya produk published. */
export async function listProducts(db: Db, params: ListingParams, now = new Date()) {
  const flags = await getFeatureFlags(db);

  const where: Prisma.ProductWhereInput = {
    status: "published",
    category: { status: "active" },
  };
  if (params.kategori) where.category = { status: "active", slug: params.kategori };
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: "insensitive" } },
      { description: { contains: params.q, mode: "insensitive" } },
      { variants: { some: { sku: { equals: params.q.toUpperCase() } } } },
    ];
  }
  if (params.min != null || params.max != null) {
    where.variants = {
      some: {
        status: "active",
        priceIdr: { gte: params.min ?? undefined, lte: params.max ?? undefined },
      },
    };
  }
  const andFilters: Prisma.ProductWhereInput[] = [];
  if (params.ukuran) {
    andFilters.push({
      variants: {
        some: {
          status: "active",
          attributes: { path: ["ukuran"], equals: params.ukuran },
        },
      },
    });
  }
  if (params.tersedia) {
    andFilters.push({ id: { in: await purchasableProductIds(db, flags) } });
  }
  if (andFilters.length > 0) where.AND = andFilters;

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    params.urut === "termurah"
      ? [{ minPriceIdr: { sort: "asc", nulls: "last" } }, { id: "asc" }]
      : params.urut === "termahal"
        ? [{ maxPriceIdr: { sort: "desc", nulls: "last" } }, { id: "asc" }]
        : [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }];

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy,
      skip: (params.hal - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        slug: true,
        name: true,
        minPriceIdr: true,
        maxPriceIdr: true,
        media: {
          where: { status: "active" },
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { objectKey: true, altText: true },
        },
        variants: { where: { status: "active" }, select: variantSelect(now) },
      },
    }),
  ]);

  const items: ProductCard[] = products.map((p) => {
    const availabilities = p.variants.map((v) => availabilityOf(v, true, flags, now));
    const sizes = new Set<string>();
    for (const v of p.variants) {
      const size = (v.attributes as Record<string, string> | null)?.ukuran;
      if (size) sizes.add(size);
    }
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      minPriceIdr: p.minPriceIdr,
      maxPriceIdr: p.maxPriceIdr,
      image: p.media[0] ?? null,
      purchasable: availabilities.some((a) => a.purchasable),
      modes: [...new Set(availabilities.filter((a) => a.purchasable).map((a) => a.mode))],
      sizes: [...sizes],
    };
  });

  return {
    items,
    total,
    page: params.hal,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export type ProductDetailVariant = {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  weightGrams: number;
  availability: Availability;
  processingDays: { min: number; max: number };
  originLabel: string;
};

/**
 * Detail produk (FR-006–FR-010). Mengembalikan null untuk produk yang tidak published —
 * termasuk lewat URL lama — sehingga halaman menampilkan 404 (FR-005).
 */
export async function getPublishedProductBySlug(db: Db, slug: string, now = new Date()) {
  const flags = await getFeatureFlags(db);
  const product = await db.product.findFirst({
    where: { slug, status: "published", category: { status: "active" } },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      material: true,
      careInstructions: true,
      sizeChart: true,
      seoTitle: true,
      seoDescription: true,
      minPriceIdr: true,
      maxPriceIdr: true,
      category: { select: { name: true, slug: true } },
      media: {
        where: { status: "active" },
        orderBy: { sortOrder: "asc" },
        select: { id: true, objectKey: true, altText: true, variantId: true, width: true, height: true },
      },
      variants: {
        where: { status: "active" },
        orderBy: { sku: "asc" },
        select: variantSelect(now),
      },
    },
  });
  if (!product) return null;

  const variants: ProductDetailVariant[] = product.variants.map((v) => {
    const availability = availabilityOf(v, true, flags, now);
    const processingDays =
      v.fulfillmentMode === "preorder" && v.preorderAllocation
        ? { min: v.preorderAllocation.processingDaysMin, max: v.preorderAllocation.processingDaysMax }
        : { min: v.fulfillmentSource.processingDaysMin, max: v.fulfillmentSource.processingDaysMax };
    return {
      id: v.id,
      sku: v.sku,
      attributes: (v.attributes ?? {}) as Record<string, string>,
      priceIdr: v.priceIdr,
      compareAtPriceIdr: v.compareAtPriceIdr,
      weightGrams: v.weightGrams,
      availability,
      processingDays,
      originLabel: v.fulfillmentSource.originLabel,
    };
  });

  return { ...product, variants };
}

export async function listActiveCategories(db: Db) {
  return db.category.findMany({
    where: { status: "active" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, parentId: true },
  });
}

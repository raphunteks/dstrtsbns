import "server-only";
import { Prisma, type PrismaClient, type ProductStatus } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import type { Tx } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";
import { attributeKey, normalizeAttributes, slugify } from "./attributes";
import { validateForPublish } from "./publish-validation";
import { productInputSchema, variantInputSchema, type ProductInput, type VariantInput } from "./schemas";

/**
 * Perintah admin katalog (FR-042–FR-047). Setiap perintah:
 *  1. cek izin di server (SEC-002),
 *  2. validasi input dengan zod,
 *  3. ubah data + tulis AuditLog dalam SATU transaksi (FR-060).
 * Perubahan harga tidak pernah menyentuh order lama — order memakai snapshot (BR-005).
 */

function zodIssues(error: { issues: { path: (string | number)[]; message: string }[] }) {
  return new ValidationError(error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
}

function uniqueViolation(error: unknown): string[] | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    return Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  }
  return null;
}

export async function recomputePriceRange(tx: Tx, productId: string) {
  const agg = await tx.productVariant.aggregate({
    where: { productId, status: "active" },
    _min: { priceIdr: true },
    _max: { priceIdr: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: { minPriceIdr: agg._min.priceIdr, maxPriceIdr: agg._max.priceIdr },
  });
}

export async function createProduct(db: PrismaClient, actor: StaffActor, raw: ProductInput) {
  assertCan(actor, "catalog.write");
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) throw zodIssues(parsed.error);
  const input = parsed.data;
  const slug = input.slug ?? slugify(input.name);

  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name: input.name,
          slug,
          description: input.description,
          material: input.material,
          careInstructions: input.careInstructions,
          sizeChart: input.sizeChart ?? Prisma.JsonNull,
          categoryId: input.categoryId,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          status: "draft",
        },
        select: { id: true, slug: true },
      });
      await writeAudit(tx, {
        actor,
        action: "product.create",
        targetType: "Product",
        targetId: product.id,
        after: { name: input.name, slug, categoryId: input.categoryId },
      });
      return product;
    });
  } catch (error) {
    if (uniqueViolation(error)?.some((t) => t.includes("slug"))) {
      throw new ValidationError([{ path: "slug", message: "Slug sudah dipakai produk lain." }]);
    }
    throw error;
  }
}

export async function updateProduct(
  db: PrismaClient,
  actor: StaffActor,
  productId: string,
  raw: ProductInput,
) {
  assertCan(actor, "catalog.write");
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) throw zodIssues(parsed.error);
  const input = parsed.data;

  try {
    return await db.$transaction(async (tx) => {
      const before = await tx.product.findUnique({
        where: { id: productId },
        select: { name: true, slug: true, categoryId: true, material: true },
      });
      if (!before) throw new NotFoundError("Product");
      const updated = await tx.product.update({
        where: { id: productId },
        data: {
          name: input.name,
          slug: input.slug ?? before.slug,
          description: input.description,
          material: input.material ?? null,
          careInstructions: input.careInstructions ?? null,
          sizeChart: input.sizeChart ?? Prisma.JsonNull,
          categoryId: input.categoryId,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
        },
        select: { id: true, slug: true },
      });
      await writeAudit(tx, {
        actor,
        action: "product.update",
        targetType: "Product",
        targetId: productId,
        before,
        after: { name: input.name, slug: updated.slug, categoryId: input.categoryId, material: input.material ?? null },
      });
      return updated;
    });
  } catch (error) {
    if (uniqueViolation(error)?.some((t) => t.includes("slug"))) {
      throw new ValidationError([{ path: "slug", message: "Slug sudah dipakai produk lain." }]);
    }
    throw error;
  }
}

/** Buat varian baru (variantId kosong) atau ubah varian yang ada. */
export async function saveVariant(
  db: PrismaClient,
  actor: StaffActor,
  productId: string,
  raw: VariantInput,
  variantId?: string,
) {
  assertCan(actor, "catalog.write");
  const parsed = variantInputSchema.safeParse(raw);
  if (!parsed.success) throw zodIssues(parsed.error);
  const input = parsed.data;
  const attributes = normalizeAttributes(input.attributes);
  const key = attributeKey(attributes);

  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
      if (!product) throw new NotFoundError("Product");

      const data = {
        sku: input.sku,
        attributes,
        attributeKey: key,
        priceIdr: input.priceIdr,
        compareAtPriceIdr: input.compareAtPriceIdr ?? null,
        weightGrams: input.weightGrams,
        lengthCm: input.lengthCm ?? null,
        widthCm: input.widthCm ?? null,
        heightCm: input.heightCm ?? null,
        status: input.status,
        fulfillmentMode: input.fulfillmentMode,
        fulfillmentSourceId: input.fulfillmentSourceId,
        lowStockThreshold: input.lowStockThreshold ?? null,
      };

      let saved: { id: string };
      if (variantId) {
        const before = await tx.productVariant.findFirst({
          where: { id: variantId, productId },
          select: { priceIdr: true, status: true, fulfillmentMode: true, fulfillmentSourceId: true },
        });
        if (!before) throw new NotFoundError("ProductVariant");

        const changesGroup =
          before.fulfillmentMode !== input.fulfillmentMode ||
          before.fulfillmentSourceId !== input.fulfillmentSourceId;
        if (changesGroup) {
          const active = await tx.stockReservation.count({ where: { variantId, state: "active" } });
          if (active > 0) {
            throw new ValidationError([
              {
                path: "fulfillmentMode",
                message: "Mode/asal kirim tidak bisa diubah selagi ada pesanan menunggu pembayaran (BR-023).",
              },
            ]);
          }
        }

        saved = await tx.productVariant.update({ where: { id: variantId }, data, select: { id: true } });
        await writeAudit(tx, {
          actor,
          action: "variant.update",
          targetType: "ProductVariant",
          targetId: variantId,
          before,
          after: {
            priceIdr: input.priceIdr,
            status: input.status,
            fulfillmentMode: input.fulfillmentMode,
            fulfillmentSourceId: input.fulfillmentSourceId,
          },
        });
      } else {
        saved = await tx.productVariant.create({ data: { ...data, productId }, select: { id: true } });
        await writeAudit(tx, {
          actor,
          action: "variant.create",
          targetType: "ProductVariant",
          targetId: saved.id,
          after: { sku: input.sku, priceIdr: input.priceIdr, fulfillmentMode: input.fulfillmentMode },
        });
      }

      await recomputePriceRange(tx, productId);
      return saved;
    });
  } catch (error) {
    const targets = uniqueViolation(error);
    if (targets?.some((t) => t.includes("sku"))) {
      throw new ValidationError([{ path: "sku", message: "SKU sudah dipakai." }]);
    }
    if (targets?.some((t) => t.includes("attributeKey"))) {
      throw new ValidationError([
        { path: "attributes", message: "Kombinasi atribut ini sudah ada di produk yang sama." },
      ]);
    }
    throw error;
  }
}

/** Draft → published / unpublished / archived (FR-042). Terbit wajib lolos validasi. */
export async function setProductStatus(
  db: PrismaClient,
  actor: StaffActor,
  productId: string,
  status: ProductStatus,
) {
  assertCan(actor, "catalog.write");

  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        status: true,
        publishedAt: true,
        description: true,
        material: true,
        careInstructions: true,
        sizeChart: true,
        category: { select: { status: true, attributeSchema: true } },
        variants: {
          select: { sku: true, status: true, attributes: true, priceIdr: true, weightGrams: true },
        },
        media: { select: { altText: true, status: true } },
      },
    });
    if (!product) throw new NotFoundError("Product");

    if (status === "published") {
      const issues = validateForPublish({
        description: product.description,
        material: product.material,
        careInstructions: product.careInstructions,
        sizeChart: product.sizeChart,
        categoryStatus: product.category.status,
        categoryAttributeSchema: product.category.attributeSchema,
        variants: product.variants,
        media: product.media,
      });
      if (issues.length > 0) {
        throw new ValidationError(issues.map((i) => ({ path: i.field, message: i.message })));
      }
    }

    const now = new Date();
    await tx.product.update({
      where: { id: productId },
      data: {
        status,
        publishedAt: status === "published" ? (product.publishedAt ?? now) : product.publishedAt,
        archivedAt: status === "archived" ? now : null,
      },
    });
    await writeAudit(tx, {
      actor,
      action: `product.${status}`,
      targetType: "Product",
      targetId: productId,
      before: { status: product.status },
      after: { status },
    });
    return { status };
  });
}

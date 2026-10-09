import "server-only";
import { randomBytes } from "node:crypto";
import type { FulfillmentMode, PrismaClient } from "@prisma/client";
import type { Db } from "@/server/db/types";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  computeAvailability,
  type Availability,
  unavailableMessage,
} from "@/server/modules/inventory/availability";
import { InsufficientAvailabilityError, NotPurchasableError } from "@/server/modules/inventory/errors";
import { getFeatureFlags, type FeatureFlags } from "@/server/modules/settings/feature-flags";

/**
 * Keranjang (FR-011–FR-014). Keranjang BUKAN reservasi stok (BR-003):
 * stok divalidasi saat menambah dan saat checkout, dikunci hanya ketika order dibuat.
 */

export const CART_TTL_DAYS = 30;
export const MAX_QTY_PER_LINE = 20;

export function newCartToken(): string {
  return randomBytes(32).toString("base64url");
}

const cartVariantSelect = {
  id: true,
  sku: true,
  attributes: true,
  priceIdr: true,
  weightGrams: true,
  status: true,
  fulfillmentMode: true,
  fulfillmentSourceId: true,
  stockOnHand: true,
  stockReserved: true,
  product: {
    select: { id: true, name: true, slug: true, status: true, categoryId: true, category: { select: { status: true } } },
  },
  preorderAllocation: {
    select: { active: true, quotaTotal: true, quotaReserved: true, cutoffAt: true, processingDaysMin: true, processingDaysMax: true },
  },
  fulfillmentSource: { select: { id: true, originLabel: true, processingDaysMin: true, processingDaysMax: true, rajaongkirOriginId: true, active: true } },
} as const;

async function loadVariant(db: Db, variantId: string, now: Date) {
  return db.productVariant.findUnique({
    where: { id: variantId },
    select: {
      ...cartVariantSelect,
      supplierAvailability: {
        where: { validUntil: { gt: now } },
        select: { committedQty: true, reservedQty: true, validUntil: true },
      },
    },
  });
}

type LoadedVariant = NonNullable<Awaited<ReturnType<typeof loadVariant>>>;

function availabilityFor(v: LoadedVariant, flags: FeatureFlags, now: Date): Availability {
  return computeAvailability(
    {
      mode: v.fulfillmentMode,
      productPublished: v.product.status === "published" && v.product.category.status === "active",
      variantActive: v.status === "active" && v.fulfillmentSource.active,
      stockOnHand: v.stockOnHand,
      stockReserved: v.stockReserved,
      preorder: v.preorderAllocation,
      supplierCommitments: v.supplierAvailability,
    },
    flags,
    now,
  );
}

export async function getOrCreateCart(db: Db, opts: { token: string | null; userId?: string | null }) {
  const now = new Date();
  if (opts.token) {
    const existing = await db.cart.findUnique({ where: { token: opts.token } });
    if (existing && existing.expiresAt > now) return { cart: existing, created: false };
  }
  if (opts.userId) {
    const userCart = await db.cart.findFirst({
      where: { userId: opts.userId, expiresAt: { gt: now } },
      orderBy: { updatedAt: "desc" },
    });
    if (userCart) return { cart: userCart, created: false };
  }
  const cart = await db.cart.create({
    data: {
      token: newCartToken(),
      userId: opts.userId ?? null,
      expiresAt: new Date(now.getTime() + CART_TTL_DAYS * 86_400_000),
    },
  });
  return { cart, created: true };
}

/** Tambah atau ubah jumlah. Server memvalidasi ulang ketersediaan (FR-009). */
export async function setCartItemQuantity(
  db: Db,
  input: { cartId: string; variantId: string; quantity: number; mode: "add" | "set" },
) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) {
    throw new ValidationError([{ path: "quantity", message: "Jumlah tidak valid." }]);
  }
  const now = new Date();
  const [flags, variant, existing] = await Promise.all([
    getFeatureFlags(db),
    loadVariant(db, input.variantId, now),
    db.cartItem.findUnique({ where: { cartId_variantId: { cartId: input.cartId, variantId: input.variantId } } }),
  ]);
  if (!variant) throw new NotFoundError("ProductVariant");

  const target = input.mode === "add" ? (existing?.quantity ?? 0) + input.quantity : input.quantity;
  if (target === 0) {
    if (existing) await db.cartItem.delete({ where: { id: existing.id } });
    return { quantity: 0 };
  }
  if (target > MAX_QTY_PER_LINE) {
    throw new ValidationError([{ path: "quantity", message: `Maksimal ${MAX_QTY_PER_LINE} per varian.` }]);
  }

  const availability = availabilityFor(variant, flags, now);
  if (!availability.purchasable) throw new NotPurchasableError(variant.id, availability.reason);
  if (target > availability.available) throw new InsufficientAvailabilityError(variant.id, variant.fulfillmentMode);

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId: input.cartId, variantId: input.variantId } },
    create: { cartId: input.cartId, variantId: input.variantId, quantity: target, addedPriceIdr: variant.priceIdr },
    update: { quantity: target },
  });
  await db.cart.update({ where: { id: input.cartId }, data: { updatedAt: now } });
  return { quantity: target };
}

export type CartLine = {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  categoryId: string;
  attributes: Record<string, string>;
  quantity: number;
  unitPriceIdr: number;
  addedPriceIdr: number;
  priceChanged: boolean;
  lineSubtotalIdr: number;
  weightGrams: number;
  mode: FulfillmentMode;
  availability: Availability;
  problem: string | null;
};

export type CartGroup = {
  key: string; // `${mode}:${fulfillmentSourceId}`
  mode: FulfillmentMode;
  fulfillmentSourceId: string;
  originLabel: string;
  originId: string | null;
  processingDays: { min: number; max: number };
  lines: CartLine[];
  subtotalIdr: number;
  weightGrams: number;
  checkoutReady: boolean;
};

export function groupKey(mode: FulfillmentMode, sourceId: string) {
  return `${mode}:${sourceId}`;
}

/**
 * Tampilan keranjang dengan harga TERKINI dari server (FR-012) dan pengelompokan per asal/mode
 * (FR-070). Bila lebih dari satu kelompok, pembeli harus checkout per kelompok (BR-025).
 */
export async function getCartView(db: Db, cartId: string) {
  const now = new Date();
  const flags = await getFeatureFlags(db);
  const items = await db.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: "asc" },
    select: {
      quantity: true,
      addedPriceIdr: true,
      variant: {
        select: {
          ...cartVariantSelect,
          supplierAvailability: {
            where: { validUntil: { gt: now } },
            select: { committedQty: true, reservedQty: true, validUntil: true },
          },
        },
      },
    },
  });

  const groups = new Map<string, CartGroup>();
  for (const item of items) {
    const v = item.variant;
    const availability = availabilityFor(v, flags, now);
    let problem: string | null = null;
    if (!availability.purchasable) problem = unavailableMessage[availability.reason];
    else if (item.quantity > availability.available) {
      problem = `Tersisa ${availability.available}. Kurangi jumlah untuk melanjutkan.`;
    }

    const line: CartLine = {
      variantId: v.id,
      sku: v.sku,
      productId: v.product.id,
      productName: v.product.name,
      productSlug: v.product.slug,
      categoryId: v.product.categoryId,
      attributes: (v.attributes ?? {}) as Record<string, string>,
      quantity: item.quantity,
      unitPriceIdr: v.priceIdr,
      addedPriceIdr: item.addedPriceIdr,
      priceChanged: v.priceIdr !== item.addedPriceIdr,
      lineSubtotalIdr: v.priceIdr * item.quantity,
      weightGrams: v.weightGrams,
      mode: v.fulfillmentMode,
      availability,
      problem,
    };

    const key = groupKey(v.fulfillmentMode, v.fulfillmentSourceId);
    const processingDays =
      v.fulfillmentMode === "preorder" && v.preorderAllocation
        ? { min: v.preorderAllocation.processingDaysMin, max: v.preorderAllocation.processingDaysMax }
        : { min: v.fulfillmentSource.processingDaysMin, max: v.fulfillmentSource.processingDaysMax };
    const fresh: CartGroup = {
      key,
      mode: v.fulfillmentMode,
      fulfillmentSourceId: v.fulfillmentSourceId,
      originLabel: v.fulfillmentSource.originLabel,
      originId: v.fulfillmentSource.rajaongkirOriginId,
      processingDays,
      lines: [],
      subtotalIdr: 0,
      weightGrams: 0,
      checkoutReady: true,
    };
    const group = groups.get(key) ?? fresh;
    group.lines.push(line);
    group.subtotalIdr += line.lineSubtotalIdr;
    group.weightGrams += line.weightGrams * line.quantity;
    group.processingDays = {
      min: Math.max(group.processingDays.min, processingDays.min),
      max: Math.max(group.processingDays.max, processingDays.max),
    };
    if (problem) group.checkoutReady = false;
    groups.set(key, group);
  }

  const list = [...groups.values()];
  return {
    cartId,
    groups: list,
    needsSplit: list.length > 1,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    anyPriceChanged: list.some((g) => g.lines.some((l) => l.priceChanged)),
  };
}

/** Konfirmasi harga terbaru setelah pembeli melihat perubahan (FR-012). */
export async function acknowledgePriceChanges(db: Db, cartId: string) {
  const items = await db.cartItem.findMany({
    where: { cartId },
    select: { id: true, variant: { select: { priceIdr: true } } },
  });
  for (const item of items) {
    await db.cartItem.update({ where: { id: item.id }, data: { addedPriceIdr: item.variant.priceIdr } });
  }
}

/**
 * Gabungkan keranjang guest ke akun saat login tanpa item ganda (FR-014).
 * Jumlah dijumlahkan dan dibatasi MAX_QTY_PER_LINE; stok divalidasi ulang di tampilan.
 */
export async function mergeGuestCartIntoUser(
  db: PrismaClient,
  guestToken: string,
  userId: string,
) {
  return db.$transaction(async (tx) => {
    const guest = await tx.cart.findUnique({ where: { token: guestToken }, include: { items: true } });
    if (!guest || guest.userId === userId) return guest?.id ?? null;

    const userCart = await tx.cart.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
    if (!userCart) {
      await tx.cart.update({ where: { id: guest.id }, data: { userId } });
      return guest.id;
    }
    for (const item of guest.items) {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
      });
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(MAX_QTY_PER_LINE, existing.quantity + item.quantity) },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: userCart.id,
            variantId: item.variantId,
            quantity: item.quantity,
            addedPriceIdr: item.addedPriceIdr,
          },
        });
      }
    }
    await tx.cart.delete({ where: { id: guest.id } });
    return userCart.id;
  });
}

import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { contendedTx } from "@/server/db/types";
import { DomainError, ValidationError } from "@/server/errors";
import type { RajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";
import { getCartView, type CartGroup } from "@/server/modules/cart/service";
import { applyCouponInTx } from "@/server/modules/coupons/redeem";
import { reserveForOrder } from "@/server/modules/inventory/reservations";
import { generatePublicNumber, guestAccessToken, hashToken } from "@/server/modules/orders/identifiers";
import { getFeatureFlags } from "@/server/modules/settings/feature-flags";
import { ShippingOptionChangedError } from "@/server/modules/shipping/errors";
import { findOption, packageWeightGrams, quoteShipping } from "@/server/modules/shipping/quotes";
import { placeOrderSchema, type PlaceOrderInput } from "./schemas";

/**
 * Membuat order dari satu kelompok keranjang (FR-020–FR-023, FR-070–FR-072).
 *
 * Urutan sengaja:
 *  1. Idempotensi: kunci yang sama → order yang sama, bukan order kedua (FR-023).
 *  2. Ongkir di-quote ULANG ke RajaOngkir di luar transaksi (panggilan jaringan tidak boleh
 *     menahan kunci DB) — tarif lama tidak dipakai diam-diam (BR-008, FR-091).
 *  3. Satu transaksi: kunci kupon, hitung total server, bandingkan dengan total yang dilihat
 *     pembeli, buat order + snapshot + reservasi atomik. Gagal di titik mana pun → tidak ada
 *     order, tidak ada stok tertahan.
 */

export class CartNotReadyError extends DomainError {
  constructor(reason: "group_not_found" | "has_problems" | "empty") {
    super(
      "cart_not_ready",
      reason === "has_problems"
        ? "Ada produk di keranjang yang perlu diperiksa sebelum lanjut."
        : "Keranjang untuk checkout ini tidak ditemukan atau kosong.",
      { reason },
    );
    this.name = "CartNotReadyError";
  }
}

export class TotalChangedError extends DomainError {
  constructor(public readonly breakdown: OrderTotals) {
    super(
      "total_changed",
      "Total belanja berubah (harga, promo, atau ongkir). Periksa ringkasan baru sebelum membayar.",
      { ...breakdown },
    );
    this.name = "TotalChangedError";
  }
}

export type OrderTotals = {
  itemsSubtotalIdr: number;
  discountIdr: number;
  shippingIdr: number;
  feeIdr: number;
  grandTotalIdr: number;
};

export type PlaceOrderDeps = {
  db: PrismaClient;
  shippingClient: RajaOngkirClient | null;
  appSecret: string;
  now?: Date;
};

export type PlaceOrderResult = {
  orderId: string;
  publicNumber: string;
  guestAccessToken: string;
  grandTotalIdr: number;
  reused: boolean;
};

async function existingOrder(deps: PlaceOrderDeps, idempotencyKey: string): Promise<PlaceOrderResult | null> {
  const found = await deps.db.order.findUnique({
    where: { idempotencyKey },
    select: { id: true, publicNumber: true, grandTotalIdr: true },
  });
  if (!found) return null;
  return {
    orderId: found.id,
    publicNumber: found.publicNumber,
    guestAccessToken: guestAccessToken(deps.appSecret, found.id),
    grandTotalIdr: found.grandTotalIdr,
    reused: true,
  };
}

export async function placeOrder(deps: PlaceOrderDeps, raw: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const input = parsed.data;
  const { db } = deps;
  const now = deps.now ?? new Date();

  const reused = await existingOrder(deps, input.idempotencyKey);
  if (reused) return reused;

  // ── Keranjang & kelompok ───────────────────────────────────────────
  const cart = await db.cart.findUnique({ where: { id: input.cartId }, select: { id: true, userId: true } });
  if (!cart) throw new CartNotReadyError("group_not_found");
  if (cart.userId && input.userId !== cart.userId) throw new CartNotReadyError("group_not_found");

  const view = await getCartView(db, cart.id);
  const group: CartGroup | undefined = view.groups.find((g) => g.key === input.groupKey);
  if (!group || group.lines.length === 0) throw new CartNotReadyError("empty");
  if (!group.checkoutReady) throw new CartNotReadyError("has_problems");

  // ── Ongkir terbaru (di luar transaksi) ─────────────────────────────
  const settings = await db.storeSettings.findUnique({
    where: { id: 1 },
    select: { shippingCouriers: true, reservationHoldMinutes: true },
  });
  const weightGrams = packageWeightGrams(group.lines);
  const options = await quoteShipping(
    { db, client: deps.shippingClient },
    {
      originId: group.originId,
      destinationId: input.address.destinationId,
      weightGrams,
      couriers: settings?.shippingCouriers ?? [],
    },
    { bypassCache: true },
  );
  const chosen = findOption(options, input.shipping.courierCode, input.shipping.serviceCode);
  if (!chosen) throw new ShippingOptionChangedError(null);

  const flags = await getFeatureFlags(db);
  const orderId = randomUUID();
  const token = guestAccessToken(deps.appSecret, orderId);
  const holdMinutes = settings?.reservationHoldMinutes ?? 30;
  const reservationExpiresAt = new Date(now.getTime() + holdMinutes * 60_000);

  try {
    return await db.$transaction(async (tx) => {
      // ── Kupon (dikunci) ─────────────────────────────────────────────
      const discountLines = group.lines.map((l) => ({
        variantId: l.variantId,
        categoryId: l.categoryId,
        lineSubtotalIdr: l.lineSubtotalIdr,
      }));
      const coupon = input.couponCode
        ? await applyCouponInTx(tx, {
            code: input.couponCode,
            lines: discountLines,
            userId: input.userId ?? null,
            contactPhone: input.contact.phone,
            now,
          })
        : null;

      // ── Total dihitung server; harus sama dengan yang dilihat pembeli (BR-007, FR-020) ──
      const totals: OrderTotals = {
        itemsSubtotalIdr: group.subtotalIdr,
        discountIdr: coupon?.discountIdr ?? 0,
        shippingIdr: chosen.costIdr,
        feeIdr: 0, // biaya Pakasir menunggu keputusan OD-016 (Fase 4)
        grandTotalIdr: 0,
      };
      totals.grandTotalIdr = totals.itemsSubtotalIdr - totals.discountIdr + totals.shippingIdr + totals.feeIdr;
      if (totals.grandTotalIdr !== input.expectedTotalIdr) throw new TotalChangedError(totals);

      // ── Order + snapshot ────────────────────────────────────────────
      const order = await tx.order.create({
        data: {
          id: orderId,
          publicNumber: generatePublicNumber(),
          userId: input.userId ?? null,
          contact: {
            name: input.contact.name,
            email: input.contact.email ?? null,
            phone: input.contact.phone,
            marketingOptIn: input.contact.marketingOptIn,
          },
          shippingAddress: { ...input.address },
          status: "pending_payment",
          paymentStatus: "unpaid",
          fulfillmentMode: group.mode,
          fulfillmentSourceId: group.fulfillmentSourceId,
          processingDaysMin: group.processingDays.min,
          processingDaysMax: group.processingDays.max,
          ...totals,
          couponCode: coupon?.code ?? null,
          idempotencyKey: input.idempotencyKey,
          guestAccessTokenHash: hashToken(token),
          reservationExpiresAt,
          placedAt: now,
          items: {
            create: group.lines.map((l, i) => {
              const lineDiscount = coupon?.perLine[i] ?? 0;
              return {
                variantId: l.variantId,
                productNameSnap: l.productName,
                skuSnap: l.sku,
                attributesSnap: l.attributes,
                unitPriceIdr: l.unitPriceIdr,
                quantity: l.quantity,
                discountIdr: lineDiscount,
                lineTotalIdr: l.lineSubtotalIdr - lineDiscount,
                weightGramsSnap: l.weightGrams,
                fulfillmentModeSnap: l.mode,
              };
            }),
          },
          rateSnapshot: {
            create: {
              originId: group.originId!,
              destinationId: input.address.destinationId,
              weightGrams,
              courierCode: chosen.courierCode,
              serviceCode: chosen.serviceCode,
              serviceName: `${chosen.courierName} ${chosen.serviceCode}`,
              costIdr: chosen.costIdr,
              etd: chosen.etd,
              quotedAt: now,
            },
          },
        },
        select: { id: true, publicNumber: true, grandTotalIdr: true },
      });

      if (coupon) {
        await tx.couponRedemption.create({
          data: {
            couponId: coupon.couponId,
            orderId: order.id,
            userId: input.userId ?? null,
            discountIdr: coupon.discountIdr,
          },
        });
      }

      // ── Reservasi atomik (AC-004). Gagal → seluruh transaksi batal. ──
      await reserveForOrder(tx, {
        orderId: order.id,
        expiresAt: reservationExpiresAt,
        lines: group.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        flags,
      });

      // Item yang sudah dipesan keluar dari keranjang; kelompok lain tetap.
      await tx.cartItem.deleteMany({
        where: { cartId: cart.id, variantId: { in: group.lines.map((l) => l.variantId) } },
      });

      return {
        orderId: order.id,
        publicNumber: order.publicNumber,
        guestAccessToken: token,
        grandTotalIdr: order.grandTotalIdr,
        reused: false,
      };
    }, contendedTx);
  } catch (error) {
    // Dua klik "Bayar" bersamaan dengan kunci sama → yang kalah mengembalikan order pemenang.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String(error.meta?.target ?? "");
      if (target.includes("idempotencyKey")) {
        const winner = await existingOrder(deps, input.idempotencyKey);
        if (winner) return winner;
      }
    }
    throw error;
  }
}

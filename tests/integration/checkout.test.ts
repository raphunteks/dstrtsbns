import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import type { RajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";
import { getCartView, getOrCreateCart, groupKey, setCartItemQuantity } from "@/server/modules/cart/service";
import { placeOrder, TotalChangedError, CartNotReadyError } from "@/server/modules/checkout/place-order";
import { previewCheckout } from "@/server/modules/checkout/preview";
import type { PlaceOrderInput } from "@/server/modules/checkout/schemas";
import { CouponRejectedError } from "@/server/modules/coupons/redeem";
import { InsufficientAvailabilityError } from "@/server/modules/inventory/errors";
import { findOrderByGuestToken } from "@/server/modules/orders/access";
import { ShippingNotConfiguredError, ShippingUnavailableError } from "@/server/modules/shipping/errors";
import { createVariant, resetDb, seedBasics } from "./helpers";

const APP_SECRET = "s".repeat(40);
const SHIPPING_COST = 18000;

function fakeShipping(cost: number | null = SHIPPING_COST): RajaOngkirClient {
  return {
    async searchDestinations() {
      return [];
    },
    async calculateDomesticCost({ courier }) {
      if (cost == null) return [];
      return [{ courierCode: courier, courierName: "JNE", serviceCode: "REG", description: null, costIdr: cost, etd: "2-3" }];
    },
  };
}

const contact = { name: "Sari Pembeli", phone: "081234567890", email: "" };
const address = {
  recipientName: "Sari Pembeli",
  phone: "081234567890",
  provinceName: "Sulawesi Selatan",
  cityName: "Makassar",
  districtName: "Panakkukang",
  street: "Jl. Contoh No. 1",
  destinationId: "1234",
  destinationLabel: "PANAKKUKANG, MAKASSAR, SULAWESI SELATAN, 90231",
};

afterAll(async () => {
  await db.$disconnect();
});

let ctx: Awaited<ReturnType<typeof seedBasics>>;

beforeEach(async () => {
  await resetDb(db);
  ctx = await seedBasics(db);
  await db.storeSettings.update({ where: { id: 1 }, data: { shippingCouriers: ["jne"] } });
  await db.fulfillmentSource.update({ where: { id: ctx.source.id }, data: { rajaongkirOriginId: "501" } });
});

async function cartWith(variantId: string, quantity: number) {
  const { cart } = await getOrCreateCart(db, { token: null });
  await setCartItemQuantity(db, { cartId: cart.id, variantId, quantity, mode: "add" });
  return cart;
}

function orderInput(
  cartId: string,
  sourceId: string,
  expectedTotalIdr: number,
  extra: Partial<PlaceOrderInput> = {},
): PlaceOrderInput {
  return {
    cartId,
    groupKey: groupKey("ready_stock", sourceId),
    contact,
    address,
    shipping: { courierCode: "jne", serviceCode: "REG" },
    expectedTotalIdr,
    idempotencyKey: randomUUID(),
    ...extra,
  };
}

const deps = (cost: number | null = SHIPPING_COST) => ({ db, shippingClient: fakeShipping(cost), appSecret: APP_SECRET });

describe("checkout jalur utama", () => {
  it("ringkasan → order dengan snapshot, reservasi, token guest, keranjang dibersihkan", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const cart = await cartWith(v.id, 2);

    const preview = await previewCheckout(
      { db, shippingClient: fakeShipping() },
      { cartId: cart.id, groupKey: groupKey("ready_stock", ctx.source.id), destinationId: "1234" },
    );
    expect(preview.options[0]).toMatchObject({ costIdr: 18000, grandTotalIdr: 196000 });

    const result = await placeOrder(deps(), orderInput(cart.id, ctx.source.id, 196000));
    expect(result.reused).toBe(false);

    const order = await db.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: { items: true, rateSnapshot: true, reservations: true },
    });
    expect(order).toMatchObject({
      status: "pending_payment",
      itemsSubtotalIdr: 178000,
      shippingIdr: 18000,
      grandTotalIdr: 196000,
    });
    expect(order.items[0]).toMatchObject({ unitPriceIdr: 89000, quantity: 2, lineTotalIdr: 178000, skuSnap: v.sku });
    expect(order.rateSnapshot).toMatchObject({ courierCode: "jne", serviceCode: "REG", costIdr: 18000, weightGrams: 600 });
    expect(order.reservations).toHaveLength(1);
    expect((order.contact as { phone: string }).phone).toBe("+6281234567890");

    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(variant.stockReserved).toBe(2);
    expect(await db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);

    // FR-028 / AC-008: link guest bekerja, nomor saja atau token lain tidak.
    expect(await findOrderByGuestToken(db, APP_SECRET, result.publicNumber, result.guestAccessToken)).toBe(order.id);
    expect(await findOrderByGuestToken(db, APP_SECRET, result.publicNumber, "token-salah")).toBeNull();
    expect(await findOrderByGuestToken(db, APP_SECRET, "DTS-TIDAKADA", result.guestAccessToken)).toBeNull();
  });

  it("perubahan harga setelah masuk keranjang → total berubah, tidak ada order (FR-012, BR-008)", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const cart = await cartWith(v.id, 2);
    await db.productVariant.update({ where: { id: v.id }, data: { priceIdr: 99000 } });

    const view = await getCartView(db, cart.id);
    expect(view.anyPriceChanged).toBe(true);

    await expect(placeOrder(deps(), orderInput(cart.id, ctx.source.id, 196000))).rejects.toBeInstanceOf(TotalChangedError);
    expect(await db.order.count()).toBe(0);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockReserved).toBe(0);
  });
});

describe("idempotensi tombol Bayar (FR-023, TEST-007)", () => {
  it("kirim ulang & klik ganda bersamaan → satu order, stok ditahan sekali", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 5 });
    const cart = await cartWith(v.id, 2);
    const input = orderInput(cart.id, ctx.source.id, 196000);

    const [a, b] = await Promise.all([placeOrder(deps(), input), placeOrder(deps(), input)]);
    const c = await placeOrder(deps(), input);
    expect(new Set([a.orderId, b.orderId, c.orderId]).size).toBe(1);
    expect(c.reused).toBe(true);
    expect(c.guestAccessToken).toBe(a.guestAccessToken);
    expect(await db.order.count()).toBe(1);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockReserved).toBe(2);
  });
});

describe("ongkir jujur (FR-021, BR-026)", () => {
  it("kurir tidak melayani alamat → checkout ditahan, bukan ongkir 0", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const cart = await cartWith(v.id, 1);
    await expect(placeOrder(deps(null), orderInput(cart.id, ctx.source.id, 89000))).rejects.toBeInstanceOf(
      ShippingUnavailableError,
    );
    expect(await db.order.count()).toBe(0);
  });

  it("asal kirim atau kurir belum dikonfigurasi → ditahan dengan pesan jelas (OD-004)", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const cart = await cartWith(v.id, 1);
    await db.storeSettings.update({ where: { id: 1 }, data: { shippingCouriers: [] } });
    await expect(placeOrder(deps(), orderInput(cart.id, ctx.source.id, 107000))).rejects.toBeInstanceOf(
      ShippingNotConfiguredError,
    );
  });
});

describe("stok saat checkout", () => {
  it("dua keranjang berebut unit terakhir → satu order, yang kalah tanpa order & tanpa stok tertahan", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 1 });
    const cartA = await cartWith(v.id, 1);
    const cartB = await cartWith(v.id, 1);

    const results = await Promise.allSettled([
      placeOrder(deps(), orderInput(cartA.id, ctx.source.id, 107000)),
      placeOrder(deps(), orderInput(cartB.id, ctx.source.id, 107000)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientAvailabilityError);
    expect(await db.order.count()).toBe(1);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockReserved).toBe(1);
  });

  it("jumlah di keranjang melebihi stok terkini → keranjang ditandai, checkout ditolak", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const cart = await cartWith(v.id, 3);
    await db.productVariant.update({ where: { id: v.id }, data: { stockOnHand: 1 } });
    const view = await getCartView(db, cart.id);
    expect(view.groups[0]?.lines[0]?.problem).toMatch(/Tersisa 1/);
    await expect(placeOrder(deps(), orderInput(cart.id, ctx.source.id, 285000))).rejects.toBeInstanceOf(CartNotReadyError);
  });

  it("keranjang campuran asal kirim dipisah; checkout satu kelompok tidak menyentuh kelompok lain (FR-070)", async () => {
    const other = await db.fulfillmentSource.create({
      data: { code: "SRC-B", name: "Gudang B", type: "own_warehouse", originLabel: "Gudang B", originAddress: {}, active: true, rajaongkirOriginId: "777" },
    });
    const a = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 3 });
    const b = await createVariant(db, { categoryId: ctx.category.id, sourceId: other.id, stockOnHand: 3 });
    const cart = await cartWith(a.id, 1);
    await setCartItemQuantity(db, { cartId: cart.id, variantId: b.id, quantity: 1, mode: "add" });

    const view = await getCartView(db, cart.id);
    expect(view.needsSplit).toBe(true);
    expect(view.groups).toHaveLength(2);

    await placeOrder(deps(), orderInput(cart.id, ctx.source.id, 107000));
    const remaining = await db.cartItem.findMany({ where: { cartId: cart.id } });
    expect(remaining.map((i) => i.variantId)).toEqual([b.id]);
  });
});

describe("kupon saat checkout", () => {
  it("batas pemakaian 1 dengan 5 checkout paralel → tepat satu yang mendapat diskon", async () => {
    const v = await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: 10 });
    await db.coupon.create({
      data: {
        code: "HEMAT10",
        type: "fixed_amount",
        value: 10000,
        startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() + 86_400_000),
        usageLimit: 1,
        active: true,
      },
    });
    const carts = await Promise.all(Array.from({ length: 5 }, () => cartWith(v.id, 1)));
    const results = await Promise.allSettled(
      carts.map((c) =>
        placeOrder(deps(), orderInput(c.id, ctx.source.id, 97000, { couponCode: "hemat10" })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected") as PromiseRejectedResult[]) {
      expect(r.reason).toBeInstanceOf(CouponRejectedError);
    }
    expect(await db.couponRedemption.count()).toBe(1);
    const order = await db.order.findFirstOrThrow({ include: { items: true } });
    expect(order).toMatchObject({ discountIdr: 10000, grandTotalIdr: 97000, couponCode: "HEMAT10" });
    expect(order.items[0]).toMatchObject({ discountIdr: 10000, lineTotalIdr: 79000 });
  });
});

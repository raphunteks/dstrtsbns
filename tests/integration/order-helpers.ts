import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { StaffActor } from "@/server/auth/permissions";
import type { RajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";
import { getOrCreateCart, groupKey, setCartItemQuantity } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/checkout/place-order";
import { applyVerifiedCompletion } from "@/server/modules/payments/apply-completion";
import { createVariant, seedBasics } from "./helpers";

export const APP_SECRET = "o".repeat(40);

export const staff = {
  order: { userId: "00000000-0000-4000-8000-0000000000a1", roles: ["admin_order"] } as StaffActor,
  orderB: { userId: "00000000-0000-4000-8000-0000000000a4", roles: ["admin_order"] } as StaffActor,
  finance: { userId: "00000000-0000-4000-8000-0000000000a2", roles: ["admin_finance"] } as StaffActor,
  financeB: { userId: "00000000-0000-4000-8000-0000000000a5", roles: ["admin_finance"] } as StaffActor,
  catalog: { userId: "00000000-0000-4000-8000-0000000000a3", roles: ["admin_catalog"] } as StaffActor,
};

export const fakeShipping: RajaOngkirClient = {
  async searchDestinations() {
    return [];
  },
  async calculateDomesticCost({ courier }) {
    return [{ courierCode: courier, courierName: "JNE", serviceCode: "REG", description: null, costIdr: 18000, etd: "2-3" }];
  },
};

export async function setupStore(db: PrismaClient) {
  const ctx = await seedBasics(db);
  await db.storeSettings.update({
    where: { id: 1 },
    data: { shippingCouriers: ["jne"], supportEmail: "admin@toko.test" },
  });
  await db.fulfillmentSource.update({ where: { id: ctx.source.id }, data: { rajaongkirOriginId: "501" } });
  return ctx;
}

/** Order nyata lewat checkout: 2 × Rp89.000 + ongkir Rp18.000 = Rp196.000. */
export async function makePendingOrder(
  db: PrismaClient,
  ctx: Awaited<ReturnType<typeof setupStore>>,
  opts: { stock?: number; email?: string | null; variantId?: string } = {},
) {
  const variantId =
    opts.variantId ??
    (await createVariant(db, { categoryId: ctx.category.id, sourceId: ctx.source.id, stockOnHand: opts.stock ?? 5 })).id;
  const { cart } = await getOrCreateCart(db, { token: null });
  await setCartItemQuantity(db, { cartId: cart.id, variantId, quantity: 2, mode: "add" });
  const order = await placeOrder(
    { db, shippingClient: fakeShipping, appSecret: APP_SECRET },
    {
      cartId: cart.id,
      groupKey: groupKey("ready_stock", ctx.source.id),
      contact: { name: "Sari", phone: "081234567890", email: opts.email === null ? "" : (opts.email ?? "sari@contoh.id") },
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
  return { orderId: order.orderId, publicNumber: order.publicNumber, variantId };
}

/** Lunas lewat jalur yang sama dengan webhook terverifikasi. */
export async function payOrder(db: PrismaClient, orderId: string, suffix = "1") {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const attempt = await db.paymentAttempt.create({
    data: {
      orderId,
      projectSlug: "uji",
      providerOrderId: `${order.publicNumber}-${suffix}`,
      txnId: `txn-${order.publicNumber}-${suffix}`,
      method: "payment_link",
      amountIdr: order.grandTotalIdr,
      isSandbox: true,
    },
  });
  return applyVerifiedCompletion(db, {
    attemptId: attempt.id,
    fingerprint: `uji:${attempt.id}`,
    completedAt: new Date(),
    payload: { uji: true },
    now: new Date(),
  });
}

export async function makePaidOrder(
  db: PrismaClient,
  ctx: Awaited<ReturnType<typeof setupStore>>,
  opts: { stock?: number; email?: string | null; variantId?: string } = {},
) {
  const o = await makePendingOrder(db, ctx, opts);
  await payOrder(db, o.orderId);
  return o;
}

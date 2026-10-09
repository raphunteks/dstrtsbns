"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { isDomainError } from "@/server/errors";
import { CART_COOKIE } from "@/server/modules/cart/current";
import { CART_TTL_DAYS, getOrCreateCart, setCartItemQuantity } from "@/server/modules/cart/service";

export type AddToCartState = { ok: boolean; message: string } | null;

const schema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
});

/** Tambah ke keranjang (FR-011). Ketersediaan divalidasi ulang di server (FR-009). */
export async function addToCartAction(_prev: AddToCartState, formData: FormData): Promise<AddToCartState> {
  const parsed = schema.safeParse({ variantId: formData.get("variantId"), quantity: formData.get("quantity") });
  if (!parsed.success) return { ok: false, message: "Pilih varian dan jumlah terlebih dahulu." };

  const store = await cookies();
  try {
    const { cart } = await getOrCreateCart(db, { token: store.get(CART_COOKIE)?.value ?? null });
    if (store.get(CART_COOKIE)?.value !== cart.token) {
      store.set(CART_COOKIE, cart.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: getEnv().NODE_ENV === "production",
        path: "/",
        maxAge: CART_TTL_DAYS * 86_400,
      });
    }
    await setCartItemQuantity(db, { cartId: cart.id, variantId: parsed.data.variantId, quantity: parsed.data.quantity, mode: "add" });
    return { ok: true, message: "Ditambahkan ke keranjang." };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    console.error("[addToCart]", error instanceof Error ? error.message : "unknown");
    return { ok: false, message: "Ada kendala. Coba lagi." };
  }
}

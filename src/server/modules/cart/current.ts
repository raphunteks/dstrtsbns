import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db/client";

export const CART_COOKIE = "dts_cart";

/** Jumlah barang di keranjang pengunjung saat ini (untuk badge header). */
export async function getCurrentCartCount(): Promise<number> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return 0;
  const result = await db.cartItem.aggregate({
    where: { cart: { token, expiresAt: { gt: new Date() } } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/** ID keranjang aktif dari cookie, tanpa membuat keranjang baru. */
export async function getCurrentCartId(): Promise<string | null> {
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await db.cart.findFirst({ where: { token, expiresAt: { gt: new Date() } }, select: { id: true } });
  return cart?.id ?? null;
}

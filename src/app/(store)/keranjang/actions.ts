"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { isDomainError } from "@/server/errors";
import { getCurrentCartId } from "@/server/modules/cart/current";
import { acknowledgePriceChanges, setCartItemQuantity } from "@/server/modules/cart/service";

export type CartActionState = { ok: boolean; message: string } | null;

const qtySchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(20),
});

/** Ubah jumlah / hapus baris keranjang (FR-012). quantity 0 = hapus. */
export async function updateCartLineAction(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  const parsed = qtySchema.safeParse({ variantId: formData.get("variantId"), quantity: formData.get("quantity") });
  if (!parsed.success) return { ok: false, message: "Jumlah tidak valid." };
  const cartId = await getCurrentCartId();
  if (!cartId) return { ok: false, message: "Keranjang sudah kedaluwarsa. Muat ulang halaman." };
  try {
    await setCartItemQuantity(db, { cartId, variantId: parsed.data.variantId, quantity: parsed.data.quantity, mode: "set" });
    revalidatePath("/keranjang");
    return { ok: true, message: parsed.data.quantity === 0 ? "Produk dihapus." : "Jumlah diperbarui." };
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message };
    console.error("[cart:update]", error instanceof Error ? error.message : "unknown");
    return { ok: false, message: "Ada kendala. Coba lagi." };
  }
}

/** Pembeli menyetujui harga terbaru (FR-012). */
export async function acknowledgePricesAction(): Promise<void> {
  const cartId = await getCurrentCartId();
  if (cartId) await acknowledgePriceChanges(db, cartId);
  revalidatePath("/keranjang");
}

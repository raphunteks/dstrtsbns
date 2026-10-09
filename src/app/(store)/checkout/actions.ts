"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { isDomainError, ValidationError } from "@/server/errors";
import { getCurrentCartId } from "@/server/modules/cart/current";
import { placeOrder, TotalChangedError } from "@/server/modules/checkout/place-order";
import { previewCheckout } from "@/server/modules/checkout/preview";
import type { PlaceOrderInput } from "@/server/modules/checkout/schemas";
import { getRajaOngkirClient } from "@/server/modules/shipping/provider";

export type QuoteOption = {
  courierCode: string;
  courierName: string;
  serviceCode: string;
  description: string | null;
  costIdr: number;
  etd: string | null;
  grandTotalIdr: number;
};

export type PreviewResult =
  | { ok: true; itemsSubtotalIdr: number; discountIdr: number; couponMessage: string | null; options: QuoteOption[] }
  | { ok: false; message: string };

const previewSchema = z.object({
  groupKey: z.string().min(3).max(120),
  destinationId: z.string().min(1).max(40),
  couponCode: z.string().trim().max(40).optional(),
});

function failure(error: unknown, tag: string): { ok: false; message: string } {
  if (isDomainError(error)) return { ok: false, message: error.message };
  console.error(`[checkout:${tag}]`, error instanceof Error ? error.message : "unknown");
  return { ok: false, message: "Ada kendala. Coba lagi." };
}

/** Hitung ongkir & total per layanan (SCR-005/006). Selalu dari server, tidak pernah ongkir 0 (BR-026). */
export async function previewAction(input: z.input<typeof previewSchema>): Promise<PreviewResult> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pilih kecamatan tujuan dulu." };
  const cartId = await getCurrentCartId();
  if (!cartId) return { ok: false, message: "Keranjang sudah kedaluwarsa." };
  try {
    const result = await previewCheckout({ db, shippingClient: getRajaOngkirClient() }, { cartId, ...parsed.data });
    return {
      ok: true,
      itemsSubtotalIdr: result.itemsSubtotalIdr,
      discountIdr: result.discountIdr,
      couponMessage: result.couponMessage,
      options: result.options,
    };
  } catch (error) {
    return failure(error, "preview");
  }
}

export type PlaceOrderActionResult =
  | { ok: true; url: string }
  | { ok: false; message: string; issues?: { path: string; message: string }[]; totalChanged?: boolean };

/**
 * Buat order + tahan stok (FR-022, FR-023). `idempotencyKey` dibuat sekali per halaman checkout di klien
 * sehingga klik ganda / retry jaringan menghasilkan order yang sama.
 */
export async function placeOrderAction(
  input: Omit<PlaceOrderInput, "cartId" | "userId">,
): Promise<PlaceOrderActionResult> {
  const cartId = await getCurrentCartId();
  if (!cartId) return { ok: false, message: "Keranjang sudah kedaluwarsa." };
  try {
    const order = await placeOrder(
      { db, shippingClient: getRajaOngkirClient(), appSecret: getEnv().APP_SECRET },
      { ...input, cartId, idempotencyKey: input.idempotencyKey || randomUUID() },
    );
    return { ok: true, url: `/pesanan/${order.publicNumber}?t=${encodeURIComponent(order.guestAccessToken)}` };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, message: error.message, issues: (error.details?.issues ?? []) as { path: string; message: string }[] };
    }
    if (error instanceof TotalChangedError) return { ok: false, message: error.message, totalChanged: true };
    return failure(error, "place");
  }
}

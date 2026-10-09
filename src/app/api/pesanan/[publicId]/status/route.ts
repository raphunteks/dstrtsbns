import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { findOrderByGuestToken, orderAccessCookie } from "@/server/modules/orders/access";
import { getBuyerOrderStatus } from "@/server/modules/payments/buyer-status";
import { getPaymentDeps } from "@/server/modules/payments/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Status pesanan untuk pembeli (AC-020). Butuh token dari link pesanan; nomor pesanan saja ditolak
 * tanpa membedakan "tidak ada" dan "token salah" (AC-008). Tidak mengembalikan data pribadi.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const token = request.nextUrl.searchParams.get("t") ?? request.cookies.get(orderAccessCookie(publicId))?.value ?? "";
  const orderId = token ? await findOrderByGuestToken(db, getEnv().APP_SECRET, publicId, token) : null;
  if (!orderId) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });
  }
  const status = await getBuyerOrderStatus(getPaymentDeps(), orderId);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

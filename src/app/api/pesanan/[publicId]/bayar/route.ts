import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { isDomainError } from "@/server/errors";
import { ProviderError } from "@/server/integrations/http";
import { findOrderByGuestToken } from "@/server/modules/orders/access";
import { getPaymentDeps } from "@/server/modules/payments/deps";
import { startPayment } from "@/server/modules/payments/start-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({ t: z.string().min(10).max(200), method: z.string().min(3).max(30) });

/** Mulai/lanjutkan pembayaran Pakasir untuk pesanan (SCR-007). Idempoten. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });

  const orderId = await findOrderByGuestToken(db, getEnv().APP_SECRET, publicId, parsed.data.t);
  if (!orderId) return NextResponse.json({ error: "Pesanan tidak ditemukan." }, { status: 404 });

  try {
    const payment = await startPayment(getPaymentDeps(), { orderId, method: parsed.data.method });
    return NextResponse.json(payment, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isDomainError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof ProviderError) {
      return NextResponse.json(
        { error: "Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.", code: "provider_unavailable" },
        { status: 503 },
      );
    }
    throw error;
  }
}

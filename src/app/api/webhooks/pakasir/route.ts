import { NextResponse, type NextRequest } from "next/server";
import { getPaymentDeps } from "@/server/modules/payments/deps";
import { receivePakasirWebhook } from "@/server/modules/payments/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Webhook Pakasir v2. URL ini didaftarkan di halaman detail proyek Pakasir:
 *   {APP_URL}/api/webhooks/pakasir
 * Respons tidak pernah memuat detail internal.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 10_000) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }
  const result = await receivePakasirWebhook(getPaymentDeps(), {
    secretHeader: request.headers.get("x-secret"),
    rawBody,
  });
  return NextResponse.json({ ok: result.httpStatus === 200 }, { status: result.httpStatus });
}

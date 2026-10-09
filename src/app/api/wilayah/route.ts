import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { isDomainError } from "@/server/errors";
import { getRajaOngkirClient } from "@/server/modules/shipping/provider";
import { searchDestinations } from "@/server/modules/shipping/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pencarian wilayah untuk form alamat (FR-084). Proxy server-side: API key RajaOngkir
 * tidak pernah sampai ke browser (SEC-012). Hasil di-cache 7 hari.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 3) {
    return NextResponse.json({ items: [] });
  }
  if (q.length > 80) {
    return NextResponse.json({ error: "Kata kunci terlalu panjang." }, { status: 400 });
  }
  try {
    const items = await searchDestinations({ db, client: getRajaOngkirClient() }, q);
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    if (isDomainError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    console.error("[wilayah] gagal", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Pencarian wilayah sedang bermasalah." }, { status: 500 });
  }
}

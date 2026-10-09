import "server-only";
import type { Db } from "@/server/db/types";
import { ProviderError } from "@/server/integrations/http";
import type { Destination, RajaOngkirClient, ShippingOption } from "@/server/integrations/rajaongkir-cost/client";
import { readCache, writeCache } from "./cache";
import { ShippingNotConfiguredError, ShippingUnavailableError } from "./errors";

const QUOTE_TTL_MS = 10 * 60_000; // tarif boleh di-cache singkat untuk tampilan; order selalu re-quote
const DESTINATION_TTL_MS = 7 * 24 * 60 * 60_000;

/** Berat paket = Σ berat varian × qty (BR-036). Minimal 1 gram agar provider menerima. */
export function packageWeightGrams(lines: { weightGrams: number; quantity: number }[]): number {
  const total = lines.reduce((sum, l) => sum + l.weightGrams * l.quantity, 0);
  return Math.max(1, Math.round(total));
}

export type QuoteRequest = {
  originId: string | null;
  destinationId: string;
  weightGrams: number;
  couriers: string[];
};

/**
 * Semua layanan pengiriman yang tersedia, termurah dulu (FR-019, FR-085).
 * Kurir yang tidak melayani rute diabaikan. Bila tak satu pun tersedia → error,
 * bukan ongkir 0 (BR-026).
 */
export async function quoteShipping(
  deps: { db: Db; client: RajaOngkirClient | null },
  req: QuoteRequest,
  opts: { bypassCache?: boolean } = {},
): Promise<ShippingOption[]> {
  if (!req.originId) throw new ShippingNotConfiguredError("origin");
  if (req.couriers.length === 0) throw new ShippingNotConfiguredError("couriers");
  if (!deps.client) throw new ShippingNotConfiguredError("api_key");
  const client = deps.client;

  const couriers = [...new Set(req.couriers.map((c) => c.trim().toLowerCase()).filter(Boolean))].sort();
  const cacheKey = `ro:cost:${req.originId}:${req.destinationId}:${req.weightGrams}:${couriers.join(",")}`;
  if (!opts.bypassCache) {
    const cached = await readCache<ShippingOption[]>(deps.db, cacheKey);
    if (cached) return cached;
  }

  const settled = await Promise.allSettled(
    couriers.map((courier) =>
      client.calculateDomesticCost({
        originId: req.originId!,
        destinationId: req.destinationId,
        weightGrams: req.weightGrams,
        courier,
      }),
    ),
  );

  const options = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => a.costIdr - b.costIdr || a.courierCode.localeCompare(b.courierCode));

  if (options.length === 0) {
    const allFailed = settled.every((r) => r.status === "rejected");
    const authFailed = settled.some(
      (r) => r.status === "rejected" && r.reason instanceof ProviderError && r.reason.kind === "auth",
    );
    if (authFailed) throw new ShippingNotConfiguredError("api_key");
    throw new ShippingUnavailableError(allFailed ? "provider_down" : "no_service");
  }

  await writeCache(deps.db, cacheKey, options, QUOTE_TTL_MS);
  return options;
}

/** Pencarian wilayah untuk form alamat (FR-084), di-cache 7 hari. */
export async function searchDestinations(
  deps: { db: Db; client: RajaOngkirClient | null },
  query: string,
): Promise<Destination[]> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (q.length < 3) return [];
  if (!deps.client) throw new ShippingNotConfiguredError("api_key");
  const cacheKey = `ro:dest:${q}`;
  const cached = await readCache<Destination[]>(deps.db, cacheKey);
  if (cached) return cached;
  try {
    const result = await deps.client.searchDestinations(q, 10);
    await writeCache(deps.db, cacheKey, result, DESTINATION_TTL_MS);
    return result;
  } catch (error) {
    if (error instanceof ProviderError && error.kind === "auth") throw new ShippingNotConfiguredError("api_key");
    throw new ShippingUnavailableError("provider_down");
  }
}

export function findOption(options: ShippingOption[], courierCode: string, serviceCode: string) {
  return options.find(
    (o) => o.courierCode === courierCode.toLowerCase() && o.serviceCode === serviceCode,
  );
}

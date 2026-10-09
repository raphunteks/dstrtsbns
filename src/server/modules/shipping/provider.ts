import "server-only";
import { getEnv } from "@/server/env";
import { createRajaOngkirClient, type RajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";

/** Klien produksi dari env; null bila API key belum diisi (fitur pengiriman tertahan dengan jujur). */
export function getRajaOngkirClient(): RajaOngkirClient | null {
  const env = getEnv();
  if (!env.RAJAONGKIR_COST_API_KEY) return null;
  return createRajaOngkirClient({ baseUrl: env.RAJAONGKIR_COST_BASE_URL, apiKey: env.RAJAONGKIR_COST_API_KEY });
}

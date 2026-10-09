import "server-only";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { createPakasirClient } from "@/server/integrations/pakasir/client";
import type { PaymentDeps } from "./types";

/** Dependensi produksi. Tanpa slug/API key/webhook secret → pembayaran tertahan dengan jujur (NFR-020). */
export function getPaymentDeps(): PaymentDeps {
  const env = getEnv();
  const configured = env.PAKASIR_PROJECT_SLUG && env.PAKASIR_API_KEY && env.PAKASIR_WEBHOOK_SECRET;
  if (!configured) return { db, pakasir: null, config: null };
  return {
    db,
    pakasir: createPakasirClient({
      baseUrl: env.PAKASIR_BASE_URL,
      slug: env.PAKASIR_PROJECT_SLUG!,
      apiKey: env.PAKASIR_API_KEY!,
    }),
    config: {
      slug: env.PAKASIR_PROJECT_SLUG!,
      webhookSecret: env.PAKASIR_WEBHOOK_SECRET!,
      isSandbox: env.PAKASIR_IS_SANDBOX,
      appUrl: env.APP_URL,
    },
  };
}

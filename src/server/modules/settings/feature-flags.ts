import "server-only";
import { z } from "zod";
import type { Db } from "@/server/db/types";

/**
 * Mode pemenuhan yang aktif. Default aman: hanya ready_stock (OD-002 belum diputuskan).
 * Mode yang mati tidak boleh tampil sebagai bisa dibeli, apa pun data stoknya (FR-066).
 */
export const featureFlagsSchema = z.object({
  ready_stock: z.boolean().default(true),
  preorder: z.boolean().default(false),
  supplier_fulfilled: z.boolean().default(false),
  komerce_delivery: z.boolean().default(false),
});

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const defaultFeatureFlags: FeatureFlags = featureFlagsSchema.parse({});

export async function getFeatureFlags(db: Db): Promise<FeatureFlags> {
  const settings = await db.storeSettings.findUnique({
    where: { id: 1 },
    select: { featureFlags: true },
  });
  const parsed = featureFlagsSchema.safeParse(settings?.featureFlags ?? {});
  return parsed.success ? parsed.data : defaultFeatureFlags;
}

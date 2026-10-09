import "server-only";
import { db } from "@/server/db/client";
import { expireDueReservations } from "@/server/modules/inventory/reservations";
import type { JobResult } from "./registry";

export async function runExpireReservations(): Promise<JobResult> {
  const { processed, remaining } = await expireDueReservations(db, { limit: 50 });
  return { processed, remaining, status: "ok" };
}

/**
 * Komitmen pemasok yang lewat masa berlaku tidak lagi dihitung sebagai tersedia
 * (dicek langsung di query & reservasi). Job ini melaporkan berapa SKU pemasok yang
 * kini tidak punya komitmen berlaku, untuk peringatan "stale" di dashboard admin (SCR-022).
 */
export async function runExpireSupplierAvailability(): Promise<JobResult> {
  const [row] = await db.$queryRaw<{ stale: bigint }[]>`
    SELECT COUNT(*) AS stale FROM "app"."ProductVariant" v
     WHERE v."fulfillmentMode" = 'supplier_fulfilled' AND v."status" = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM "app"."SupplierAvailability" s
          WHERE s."variantId" = v."id" AND s."validUntil" > now()
            AND s."committedQty" - s."reservedQty" > 0
       )`;
  const stale = Number(row?.stale ?? 0n);
  return {
    processed: 0,
    remaining: 0,
    status: "ok",
    note: stale > 0 ? `${stale} SKU pemasok tanpa komitmen berlaku` : undefined,
  };
}

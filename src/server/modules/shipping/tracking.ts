import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { RajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";
import { applyFulfillmentTransition } from "@/server/modules/orders/fulfillment";

const SYNC_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Job sync-waybill (FR-086): resi yang sedang dalam perjalanan dicek berkala.
 * Status terbaru tidak mengubah histori secara tidak sah — hanya transisi shipped → delivered
 * yang sah yang diterapkan. Resi yang belum terlacak dibiarkan; staf tetap bisa menandai manual.
 */
export async function syncWaybills(
  deps: { db: PrismaClient; client: RajaOngkirClient | null; now?: Date },
  { limit = 20 } = {},
) {
  const { db, client } = deps;
  if (!client?.trackWaybill) return { processed: 0, remaining: 0 };
  const now = deps.now ?? new Date();
  const due = new Date(now.getTime() - SYNC_INTERVAL_MS);

  const shipments = await db.shipment.findMany({
    where: {
      status: { in: ["requested", "picked_up", "in_transit"] },
      waybill: { not: null },
      order: { status: "shipped" },
      OR: [{ trackingLastSyncAt: null }, { trackingLastSyncAt: { lte: due } }],
    },
    orderBy: [{ trackingLastSyncAt: { sort: "asc", nulls: "first" } }],
    take: limit,
    select: { id: true, orderId: true, courierCode: true, waybill: true, order: { select: { shippingAddress: true } } },
  });

  let processed = 0;
  for (const s of shipments) {
    const phone = (s.order.shippingAddress as { phone?: string } | null)?.phone ?? "";
    try {
      const result = await client.trackWaybill({
        waybill: s.waybill!,
        courier: s.courierCode,
        lastPhoneDigits: phone.replace(/\D/g, "").slice(-5) || undefined,
      });
      await db.shipment.update({ where: { id: s.id }, data: { trackingLastSyncAt: now } });
      if (result?.delivered) {
        await db.$transaction((tx) => applyFulfillmentTransition(tx, null, s.orderId, "markDelivered", "Terlacak diterima"));
      }
      processed += 1;
    } catch (error) {
      await db.shipment.update({ where: { id: s.id }, data: { trackingLastSyncAt: now } });
      console.error("[sync-waybill] gagal", s.id, error instanceof Error ? error.message : "unknown");
    }
  }
  return { processed, remaining: Math.max(0, shipments.length - processed) };
}

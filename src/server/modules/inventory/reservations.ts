import "server-only";
import type { FulfillmentMode, PrismaClient } from "@prisma/client";
import type { Tx } from "@/server/db/types";
import type { FeatureFlags } from "@/server/modules/settings/feature-flags";
import {
  InsufficientAvailabilityError,
  MixedFulfillmentGroupError,
  NotPurchasableError,
} from "./errors";

/**
 * Reservasi stok/kuota atomik (BR-003, BR-004, BR-024, AC-004).
 *
 * Kebenaran ditentukan oleh UPDATE bersyarat di Postgres, bukan oleh "cek lalu tulis" di
 * aplikasi. Dua checkout yang berebut unit terakhir → hanya satu UPDATE yang memenuhi syarat;
 * yang lain mendapat 0 baris dan transaksinya dibatalkan. CHECK constraint di database
 * (stockReserved ≤ stockOnHand) adalah pengaman terakhir.
 *
 * Semua fungsi di sini WAJIB dipanggil di dalam transaksi bersama pembuatan order.
 */

export type ReservationLine = { variantId: string; quantity: number };

type ReservedRow = {
  id: string;
  variantId: string;
  quantity: number;
  mode: FulfillmentMode;
  supplierAvailabilityId: string | null;
};

/** Gabungkan baris SKU yang sama dan urutkan agar urutan penguncian konsisten (hindari deadlock). */
export function normalizeLines(lines: ReservationLine[]): ReservationLine[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new NotPurchasableError(line.variantId, "invalid_quantity");
    }
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  return [...merged.entries()]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
}

export async function reserveForOrder(
  tx: Tx,
  input: {
    orderId: string;
    expiresAt: Date;
    lines: ReservationLine[];
    flags: FeatureFlags;
  },
): Promise<{ reservationIds: string[]; mode: FulfillmentMode; fulfillmentSourceId: string }> {
  const lines = normalizeLines(input.lines);
  if (lines.length === 0) throw new NotPurchasableError("-", "empty_order");

  const variants = await tx.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: {
      id: true,
      status: true,
      fulfillmentMode: true,
      fulfillmentSourceId: true,
      product: { select: { status: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  // Satu kelompok mode + asal kirim per order (BR-025).
  const groupKeys = new Set(variants.map((v) => `${v.fulfillmentMode}:${v.fulfillmentSourceId}`));
  if (groupKeys.size > 1) throw new MixedFulfillmentGroupError();

  const reservationIds: string[] = [];

  for (const line of lines) {
    const variant = byId.get(line.variantId);
    if (!variant) throw new NotPurchasableError(line.variantId, "not_found");
    if (variant.product.status !== "published") {
      throw new NotPurchasableError(line.variantId, "product_unpublished");
    }
    if (variant.status !== "active") throw new NotPurchasableError(line.variantId, "variant_inactive");
    if (!input.flags[variant.fulfillmentMode]) {
      throw new NotPurchasableError(line.variantId, "mode_disabled");
    }

    let supplierAvailabilityId: string | null = null;

    switch (variant.fulfillmentMode) {
      case "ready_stock": {
        const updated = await tx.$executeRaw`
          UPDATE "app"."ProductVariant"
             SET "stockReserved" = "stockReserved" + ${line.quantity},
                 "updatedAt" = now()
           WHERE "id" = ${line.variantId}::uuid
             AND "status" = 'active'
             AND "fulfillmentMode" = 'ready_stock'
             AND "stockOnHand" - "stockReserved" >= ${line.quantity}`;
        if (updated !== 1) throw new InsufficientAvailabilityError(line.variantId, "ready_stock");
        break;
      }
      case "preorder": {
        const updated = await tx.$executeRaw`
          UPDATE "app"."PreorderAllocation"
             SET "quotaReserved" = "quotaReserved" + ${line.quantity},
                 "updatedAt" = now()
           WHERE "variantId" = ${line.variantId}::uuid
             AND "active" = true
             AND ("cutoffAt" IS NULL OR "cutoffAt" > now())
             AND "quotaTotal" - "quotaReserved" >= ${line.quantity}`;
        if (updated !== 1) throw new InsufficientAvailabilityError(line.variantId, "preorder");
        break;
      }
      case "supplier_fulfilled": {
        // Komitmen pemasok harus masih berlaku sampai hold berakhir (BR-028).
        const rows = await tx.$queryRaw<{ id: string }[]>`
          UPDATE "app"."SupplierAvailability"
             SET "reservedQty" = "reservedQty" + ${line.quantity}
           WHERE "id" = (
             SELECT "id" FROM "app"."SupplierAvailability"
              WHERE "variantId" = ${line.variantId}::uuid
                AND "validUntil" > ${input.expiresAt}
                AND "committedQty" - "reservedQty" >= ${line.quantity}
              ORDER BY "validUntil" DESC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
           )
           RETURNING "id"`;
        const first = rows[0];
        if (!first) throw new InsufficientAvailabilityError(line.variantId, "supplier_fulfilled");
        supplierAvailabilityId = first.id;
        break;
      }
    }

    const reservation = await tx.stockReservation.create({
      data: {
        orderId: input.orderId,
        variantId: line.variantId,
        quantity: line.quantity,
        mode: variant.fulfillmentMode,
        supplierAvailabilityId,
        expiresAt: input.expiresAt,
      },
      select: { id: true },
    });
    reservationIds.push(reservation.id);
  }

  const first = variants[0]!;
  return {
    reservationIds,
    mode: first.fulfillmentMode,
    fulfillmentSourceId: first.fulfillmentSourceId,
  };
}

/** Kembalikan stok/kuota yang ditahan baris-baris reservasi ini. */
async function giveBack(tx: Tx, rows: ReservedRow[]) {
  for (const row of rows) {
    switch (row.mode) {
      case "ready_stock":
        await tx.$executeRaw`
          UPDATE "app"."ProductVariant"
             SET "stockReserved" = "stockReserved" - ${row.quantity}, "updatedAt" = now()
           WHERE "id" = ${row.variantId}::uuid`;
        break;
      case "preorder":
        await tx.$executeRaw`
          UPDATE "app"."PreorderAllocation"
             SET "quotaReserved" = "quotaReserved" - ${row.quantity}, "updatedAt" = now()
           WHERE "variantId" = ${row.variantId}::uuid`;
        break;
      case "supplier_fulfilled":
        await tx.$executeRaw`
          UPDATE "app"."SupplierAvailability"
             SET "reservedQty" = "reservedQty" - ${row.quantity}
           WHERE "id" = ${row.supplierAvailabilityId}::uuid`;
        break;
    }
  }
}

/**
 * Lepas reservasi aktif sebuah order. Idempoten: hanya baris yang berpindah dari
 * 'active' pada panggilan INI yang mengembalikan stok, jadi panggilan ganda aman (AC-005).
 */
export async function releaseForOrder(
  tx: Tx,
  orderId: string,
  finalState: "released" | "expired",
): Promise<number> {
  const rows = await tx.$queryRaw<ReservedRow[]>`
    UPDATE "app"."StockReservation"
       SET "state" = ${finalState}::"app"."ReservationState", "releasedAt" = now()
     WHERE "orderId" = ${orderId}::uuid AND "state" = 'active'
     RETURNING "id", "variantId", "quantity", "mode", "supplierAvailabilityId"`;
  await giveBack(tx, rows);
  return rows.length;
}

/**
 * Dipanggil saat pembayaran terverifikasi (Fase 4).
 * ready_stock: stok fisik dikurangi permanen + ledger 'sale_committed'.
 * preorder / supplier: kuota/komitmen tetap terpakai.
 * Mengembalikan 0 bila reservasi sudah tidak aktif (mis. hold kedaluwarsa) →
 * pemanggil wajib menandai payment_exception, bukan memproses pesanan (BR-011).
 */
export async function commitForOrder(tx: Tx, orderId: string): Promise<number> {
  const rows = await tx.$queryRaw<ReservedRow[]>`
    UPDATE "app"."StockReservation"
       SET "state" = 'converted'
     WHERE "orderId" = ${orderId}::uuid AND "state" = 'active'
     RETURNING "id", "variantId", "quantity", "mode", "supplierAvailabilityId"`;

  for (const row of rows) {
    if (row.mode !== "ready_stock") continue;
    await tx.$executeRaw`
      UPDATE "app"."ProductVariant"
         SET "stockOnHand" = "stockOnHand" - ${row.quantity},
             "stockReserved" = "stockReserved" - ${row.quantity},
             "updatedAt" = now()
       WHERE "id" = ${row.variantId}::uuid`;
    await tx.inventoryLedger.create({
      data: {
        variantId: row.variantId,
        delta: -row.quantity,
        reason: "sale_committed",
        referenceType: "order",
        referenceId: orderId,
      },
    });
  }
  return rows.length;
}

/**
 * Job: lepas reservasi yang lewat batas hold dan tandai order-nya kedaluwarsa.
 * Satu transaksi pendek per order. Aman dijalankan paralel/berulang.
 */
export async function expireDueReservations(
  db: PrismaClient,
  { limit = 50, now = new Date() }: { limit?: number; now?: Date } = {},
): Promise<{ processed: number; remaining: number }> {
  const due = await db.$queryRaw<{ orderId: string }[]>`
    SELECT DISTINCT "orderId" FROM "app"."StockReservation"
     WHERE "state" = 'active' AND "expiresAt" <= ${now}
     LIMIT ${limit}`;

  let processed = 0;
  for (const { orderId } of due) {
    const released = await db.$transaction(async (tx) => {
      const count = await releaseForOrder(tx, orderId, "expired");
      if (count > 0) {
        await tx.order.updateMany({
          where: { id: orderId, status: "pending_payment" },
          data: { status: "expired", paymentStatus: "expired" },
        });
      }
      return count;
    });
    if (released > 0) processed += 1;
  }

  const [{ count } = { count: 0n }] = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(DISTINCT "orderId") AS count FROM "app"."StockReservation"
     WHERE "state" = 'active' AND "expiresAt" <= ${now}`;

  return { processed, remaining: Number(count) };
}

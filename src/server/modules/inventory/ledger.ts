import "server-only";
import type { InventoryReason, PrismaClient } from "@prisma/client";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { contendedTx, type Tx } from "@/server/db/types";
import { ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";
import { StockAdjustmentRejectedError } from "./errors";

/** Alasan yang boleh dipilih staf. 'sale_committed' hanya dari sistem pembayaran. */
export const manualStockReasons = [
  "initial_count",
  "stock_in",
  "correction",
  "return_restock",
  "damaged",
  "manual_out",
] as const satisfies readonly InventoryReason[];

export type ManualStockReason = (typeof manualStockReasons)[number];

export type StockAdjustment = {
  variantId: string;
  delta: number;
  reason: ManualStockReason;
  note?: string;
  referenceType?: string;
  referenceId?: string;
};

/**
 * Ubah stok fisik ready_stock dengan jejak (FR-045). Atomik: stok tidak boleh negatif
 * dan tidak boleh turun di bawah jumlah yang sedang direservasi pembeli.
 * Barang retur tidak otomatis jadi stok jual — harus lewat alasan 'return_restock' (BR-015).
 */
export async function applyStockAdjustment(tx: Tx, actor: StaffActor | null, input: StockAdjustment) {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
    throw new ValidationError([{ path: "delta", message: "Jumlah perubahan harus bilangan bulat selain 0." }]);
  }
  if (input.reason === "correction" && !input.note?.trim()) {
    throw new ValidationError([{ path: "note", message: "Koreksi stok wajib disertai alasan." }]);
  }

  const before = await tx.productVariant.findUnique({
    where: { id: input.variantId },
    select: { stockOnHand: true, stockReserved: true, fulfillmentMode: true },
  });

  const updated = await tx.$executeRaw`
    UPDATE "app"."ProductVariant"
       SET "stockOnHand" = "stockOnHand" + ${input.delta}, "updatedAt" = now()
     WHERE "id" = ${input.variantId}::uuid
       AND "fulfillmentMode" = 'ready_stock'
       AND "stockOnHand" + ${input.delta} >= "stockReserved"
       AND "stockOnHand" + ${input.delta} >= 0`;
  if (updated !== 1 || !before) throw new StockAdjustmentRejectedError(input.variantId, input.delta);

  const entry = await tx.inventoryLedger.create({
    data: {
      variantId: input.variantId,
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      actorUserId: actor?.userId,
    },
    select: { id: true },
  });

  await writeAudit(tx, {
    actor,
    action: "stock.adjust",
    targetType: "ProductVariant",
    targetId: input.variantId,
    before: { stockOnHand: before.stockOnHand },
    after: { stockOnHand: before.stockOnHand + input.delta, ledgerId: entry.id, reason: input.reason },
    reason: input.note,
  });

  return { ledgerId: entry.id, stockOnHand: before.stockOnHand + input.delta };
}

/** Perintah staf: cek izin lalu jalankan dalam transaksi sendiri. */
export async function adjustStock(db: PrismaClient, actor: StaffActor, input: StockAdjustment) {
  assertCan(actor, "stock.adjust");
  return db.$transaction((tx) => applyStockAdjustment(tx, actor, input), contendedTx);
}

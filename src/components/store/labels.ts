import type { FulfillmentMode } from "@prisma/client";

/** Label mode pemenuhan untuk pembeli (BR-002): jujur, tanpa istilah internal. */
export const modeLabel: Record<FulfillmentMode, string> = {
  ready_stock: "Siap kirim",
  preorder: "Pre-order",
  supplier_fulfilled: "Dikirim dari mitra",
};

export function processingText(days: { min: number; max: number }): string {
  return days.min === days.max ? `Diproses ${days.min} hari kerja` : `Diproses ${days.min}–${days.max} hari kerja`;
}

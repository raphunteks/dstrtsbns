import type { FulfillmentMode } from "@prisma/client";
import type { FeatureFlags } from "@/server/modules/settings/feature-flags";

/**
 * Ketersediaan per SKU menurut mode (BR-024). Fungsi murni — dipakai untuk tampilan
 * dan untuk pre-check. Keputusan final tetap di UPDATE atomik saat reservasi.
 *
 *  ready_stock        : stok fisik − reservasi aktif
 *  preorder           : kuota − kuota terpakai, selama alokasi aktif & belum lewat cutoff
 *  supplier_fulfilled : jumlah komitmen pemasok yang masih berlaku (bukan stok fiktif)
 */

export type UnavailableReason =
  | "product_unpublished"
  | "variant_inactive"
  | "mode_disabled"
  | "out_of_stock"
  | "preorder_closed"
  | "preorder_quota_full"
  | "supplier_unconfirmed";

export type AvailabilityInput = {
  mode: FulfillmentMode;
  productPublished: boolean;
  variantActive: boolean;
  stockOnHand: number;
  stockReserved: number;
  preorder: {
    active: boolean;
    quotaTotal: number;
    quotaReserved: number;
    cutoffAt: Date | null;
  } | null;
  supplierCommitments: { committedQty: number; reservedQty: number; validUntil: Date }[];
};

export type Availability =
  | { purchasable: true; available: number; mode: FulfillmentMode }
  | { purchasable: false; available: 0; mode: FulfillmentMode; reason: UnavailableReason };

const no = (mode: FulfillmentMode, reason: UnavailableReason): Availability => ({
  purchasable: false,
  available: 0,
  mode,
  reason,
});

export function computeAvailability(
  input: AvailabilityInput,
  flags: FeatureFlags,
  now: Date = new Date(),
): Availability {
  const { mode } = input;
  if (!input.productPublished) return no(mode, "product_unpublished");
  if (!input.variantActive) return no(mode, "variant_inactive");
  if (!flags[mode]) return no(mode, "mode_disabled");

  switch (mode) {
    case "ready_stock": {
      const available = input.stockOnHand - input.stockReserved;
      return available > 0 ? { purchasable: true, available, mode } : no(mode, "out_of_stock");
    }
    case "preorder": {
      const p = input.preorder;
      if (!p || !p.active) return no(mode, "preorder_closed");
      if (p.cutoffAt && p.cutoffAt.getTime() <= now.getTime()) return no(mode, "preorder_closed");
      const available = p.quotaTotal - p.quotaReserved;
      return available > 0
        ? { purchasable: true, available, mode }
        : no(mode, "preorder_quota_full");
    }
    case "supplier_fulfilled": {
      const available = input.supplierCommitments
        .filter((c) => c.validUntil.getTime() > now.getTime())
        .reduce((sum, c) => sum + Math.max(0, c.committedQty - c.reservedQty), 0);
      return available > 0
        ? { purchasable: true, available, mode }
        : no(mode, "supplier_unconfirmed");
    }
  }
}

/** Label pembeli (DESIGN.md §14.2). Hanya ditampilkan bila mode aktif. */
export const fulfillmentModeLabel: Record<FulfillmentMode, string> = {
  ready_stock: "Ready stock",
  preorder: "Preorder",
  supplier_fulfilled: "Dikirim dari mitra",
};

export const unavailableMessage: Record<UnavailableReason, string> = {
  product_unpublished: "Produk ini belum tersedia.",
  variant_inactive: "Varian ini tidak dijual saat ini.",
  mode_disabled: "Belum dapat dipesan.",
  out_of_stock: "Varian ini sedang habis. Pilih motif atau ukuran lain.",
  preorder_closed: "Preorder untuk varian ini sudah ditutup.",
  preorder_quota_full: "Kuota preorder sudah penuh.",
  supplier_unconfirmed: "Ketersediaan dari mitra belum terkonfirmasi.",
};

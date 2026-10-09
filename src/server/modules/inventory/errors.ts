import "server-only";
import { DomainError } from "@/server/errors";

export class InsufficientAvailabilityError extends DomainError {
  constructor(variantId: string, mode: string) {
    super("insufficient_availability", "Stok atau kuota untuk varian ini tidak mencukupi.", {
      variantId,
      mode,
    });
    this.name = "InsufficientAvailabilityError";
  }
}

export class NotPurchasableError extends DomainError {
  constructor(variantId: string, reason: string) {
    super("not_purchasable", "Varian ini belum dapat dipesan.", { variantId, reason });
    this.name = "NotPurchasableError";
  }
}

export class MixedFulfillmentGroupError extends DomainError {
  constructor() {
    super(
      "mixed_fulfillment_group",
      "Produk ini perlu checkout terpisah agar ongkirnya akurat.",
    );
    this.name = "MixedFulfillmentGroupError";
  }
}

export class StockAdjustmentRejectedError extends DomainError {
  constructor(variantId: string, delta: number) {
    super(
      "stock_adjustment_rejected",
      "Penyesuaian ditolak: stok tidak boleh negatif atau di bawah jumlah yang sedang dipesan.",
      { variantId, delta },
    );
    this.name = "StockAdjustmentRejectedError";
  }
}

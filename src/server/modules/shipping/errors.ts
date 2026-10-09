import "server-only";
import { DomainError } from "@/server/errors";

/** Tidak ada tarif valid → checkout ditahan, tidak pernah ongkir 0 (FR-021, BR-026). */
export class ShippingUnavailableError extends DomainError {
  constructor(reason: "no_service" | "provider_down") {
    super(
      "shipping_unavailable",
      reason === "no_service"
        ? "Belum ada kurir aktif untuk alamat ini. Coba alamat lain atau hubungi bantuan."
        : "Biaya pengiriman belum bisa dihitung. Coba lagi atau hubungi admin.",
      { reason },
    );
    this.name = "ShippingUnavailableError";
  }
}

/** Konfigurasi toko belum lengkap (OD-004): asal kirim, kurir, atau API key. */
export class ShippingNotConfiguredError extends DomainError {
  constructor(missing: "origin" | "couriers" | "api_key") {
    super("shipping_not_configured", "Pengiriman belum dikonfigurasi toko. Silakan hubungi admin.", { missing });
    this.name = "ShippingNotConfiguredError";
  }
}

export class ShippingOptionChangedError extends DomainError {
  constructor(newCostIdr: number | null) {
    super(
      "shipping_option_changed",
      "Layanan atau biaya pengiriman berubah. Periksa ulang total sebelum membayar.",
      { newCostIdr },
    );
    this.name = "ShippingOptionChangedError";
  }
}

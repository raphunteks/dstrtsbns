import { describe, expect, it } from "vitest";
import { can } from "@/server/auth/permissions";
import { defaultFeatureFlags } from "@/server/modules/settings/feature-flags";
import { computeAvailability, type AvailabilityInput } from "./availability";
import { normalizeLines } from "./reservations";

const now = new Date("2026-10-10T00:00:00Z");
const allOn = { ...defaultFeatureFlags, preorder: true, supplier_fulfilled: true };

const base: AvailabilityInput = {
  mode: "ready_stock",
  productPublished: true,
  variantActive: true,
  stockOnHand: 5,
  stockReserved: 2,
  preorder: null,
  supplierCommitments: [],
};

describe("ketersediaan per mode (BR-024)", () => {
  it("ready_stock = stok fisik − reservasi", () => {
    expect(computeAvailability(base, allOn, now)).toEqual({ purchasable: true, available: 3, mode: "ready_stock" });
    expect(computeAvailability({ ...base, stockReserved: 5 }, allOn, now)).toMatchObject({
      purchasable: false,
      reason: "out_of_stock",
    });
  });

  it("mode yang dimatikan tidak pernah bisa dibeli (FR-066)", () => {
    const r = computeAvailability({ ...base, mode: "preorder" }, defaultFeatureFlags, now);
    expect(r).toMatchObject({ purchasable: false, reason: "mode_disabled" });
  });

  it("preorder memakai kuota dan cutoff, bukan stok tak terbatas", () => {
    const preorder = { active: true, quotaTotal: 10, quotaReserved: 10, cutoffAt: null };
    expect(computeAvailability({ ...base, mode: "preorder", preorder }, allOn, now)).toMatchObject({
      reason: "preorder_quota_full",
    });
    expect(
      computeAvailability(
        { ...base, mode: "preorder", preorder: { ...preorder, quotaReserved: 4, cutoffAt: new Date("2026-10-09T00:00:00Z") } },
        allOn,
        now,
      ),
    ).toMatchObject({ reason: "preorder_closed" });
  });

  it("pemasok hanya dihitung dari komitmen yang masih berlaku (BR-028)", () => {
    const supplierCommitments = [
      { committedQty: 5, reservedQty: 1, validUntil: new Date("2026-10-11T00:00:00Z") },
      { committedQty: 9, reservedQty: 0, validUntil: new Date("2026-10-09T00:00:00Z") },
    ];
    expect(
      computeAvailability({ ...base, mode: "supplier_fulfilled", supplierCommitments }, allOn, now),
    ).toEqual({ purchasable: true, available: 4, mode: "supplier_fulfilled" });
  });

  it("produk belum terbit atau varian nonaktif tidak bisa dibeli", () => {
    expect(computeAvailability({ ...base, productPublished: false }, allOn, now)).toMatchObject({
      reason: "product_unpublished",
    });
    expect(computeAvailability({ ...base, variantActive: false }, allOn, now)).toMatchObject({
      reason: "variant_inactive",
    });
  });
});

describe("normalisasi baris reservasi", () => {
  it("menggabungkan SKU sama dan mengurutkan untuk urutan kunci konsisten", () => {
    expect(
      normalizeLines([
        { variantId: "b", quantity: 1 },
        { variantId: "a", quantity: 2 },
        { variantId: "b", quantity: 3 },
      ]),
    ).toEqual([
      { variantId: "a", quantity: 2 },
      { variantId: "b", quantity: 4 },
    ]);
  });

  it("menolak kuantitas tidak valid", () => {
    expect(() => normalizeLines([{ variantId: "a", quantity: 0 }])).toThrow();
    expect(() => normalizeLines([{ variantId: "a", quantity: 1.5 }])).toThrow();
  });
});

describe("matriks hak akses (§11)", () => {
  it("least privilege", () => {
    const finance = { userId: "u1", roles: ["admin_finance"] as const };
    const catalog = { userId: "u2", roles: ["admin_catalog"] as const };
    expect(can(finance, "refund.approve")).toBe(true);
    expect(can(finance, "catalog.write")).toBe(false);
    expect(can(catalog, "stock.adjust")).toBe(true);
    expect(can(catalog, "refund.approve")).toBe(false);
    expect(can({ userId: "u3", roles: [] }, "order.read")).toBe(false);
  });
});

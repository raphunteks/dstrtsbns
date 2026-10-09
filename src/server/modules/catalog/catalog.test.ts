import { describe, expect, it } from "vitest";
import { attributeKey, normalizeAttributes, slugify } from "./attributes";
import { validateForPublish, type PublishCandidate } from "./publish-validation";
import { listingParamsSchema, variantInputSchema } from "./schemas";

describe("atribut & slug", () => {
  it("membuat slug yang bersih", () => {
    expect(slugify("Daster Rayon  Harian!")).toBe("daster-rayon-harian");
    expect(slugify("Setelan Rumah & Piyama")).toBe("setelan-rumah-dan-piyama");
  });

  it("kunci kombinasi tidak bergantung urutan atau huruf besar (FR-044)", () => {
    const a = attributeKey({ Warna: "Navy", ukuran: "XL" });
    const b = attributeKey({ ukuran: "xl", warna: " navy " });
    expect(a).toBe("ukuran=xl|warna=navy");
    expect(a).toBe(b);
  });

  it("membuang atribut kosong", () => {
    expect(normalizeAttributes({ motif: "Bunga", warna: "  " })).toEqual({ motif: "Bunga" });
  });
});

describe("validasi varian", () => {
  const base = {
    sku: "dts-da-001-bunga",
    attributes: { motif: "Bunga" },
    priceIdr: 89000,
    weightGrams: 300,
    fulfillmentSourceId: "00000000-0000-4000-8000-000000000001",
  };

  it("SKU dinormalisasi ke huruf besar", () => {
    const parsed = variantInputSchema.parse(base);
    expect(parsed.sku).toBe("DTS-DA-001-BUNGA");
    expect(parsed.fulfillmentMode).toBe("ready_stock");
  });

  it("menolak harga pecahan (BR-001)", () => {
    expect(variantInputSchema.safeParse({ ...base, priceIdr: 89000.5 }).success).toBe(false);
  });

  it("menolak harga coret yang tidak lebih tinggi (BR-020)", () => {
    expect(variantInputSchema.safeParse({ ...base, compareAtPriceIdr: 89000 }).success).toBe(false);
    expect(variantInputSchema.safeParse({ ...base, compareAtPriceIdr: 99000 }).success).toBe(true);
  });

  it("berat wajib untuk ongkir", () => {
    expect(variantInputSchema.safeParse({ ...base, weightGrams: 0 }).success).toBe(false);
  });
});

describe("parameter listing dari URL (FR-004)", () => {
  it("nilai rusak jatuh ke default, bukan error", () => {
    const p = listingParamsSchema.parse({ min: "abc", urut: "acak", hal: "-3", tersedia: "ya" });
    expect(p).toMatchObject({ min: undefined, urut: "terbaru", hal: 1, tersedia: false });
  });

  it("membaca filter yang valid", () => {
    const p = listingParamsSchema.parse({ kategori: "daster", min: "50000", tersedia: "1", urut: "termurah" });
    expect(p).toMatchObject({ kategori: "daster", min: 50000, tersedia: true, urut: "termurah" });
  });
});

describe("syarat terbit (FR-007, BR-031)", () => {
  const ready: PublishCandidate = {
    description: "Daster rayon adem untuk aktivitas harian di rumah, potongan longgar.",
    material: "Rayon",
    careInstructions: "Cuci tangan.",
    sizeChart: { columns: ["Ukuran", "LD (cm)"], rows: [["All Size", "110"]] },
    categoryStatus: "active",
    categoryAttributeSchema: { requiredVariantAttributes: ["ukuran"] },
    variants: [
      { sku: "A", status: "active", attributes: { ukuran: "All Size" }, priceIdr: 89000, weightGrams: 300 },
    ],
    media: [{ altText: "Daster motif bunga navy", status: "active" }],
  };

  it("produk lengkap boleh terbit", () => {
    expect(validateForPublish(ready)).toEqual([]);
  });

  it("menolak tanpa tabel ukuran, bahan, foto, atau atribut wajib", () => {
    const issues = validateForPublish({
      ...ready,
      material: null,
      sizeChart: null,
      media: [],
      variants: [{ ...ready.variants[0]!, attributes: { motif: "Bunga" } }],
    });
    const fields = issues.map((i) => i.field);
    expect(fields).toEqual(
      expect.arrayContaining(["material", "sizeChart", "media", "variants.A.attributes.ukuran"]),
    );
  });

  it("menolak tabel ukuran yang kolomnya tidak konsisten", () => {
    const issues = validateForPublish({
      ...ready,
      sizeChart: { columns: ["Ukuran", "LD"], rows: [["All Size"]] },
    });
    expect(issues.some((i) => i.field === "sizeChart")).toBe(true);
  });
});

import { z } from "zod";
import { SKU_PATTERN, SLUG_PATTERN } from "./attributes";

const idr = z.number().int("Harus bilangan bulat rupiah").min(0, "Tidak boleh negatif");
const optionalText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Satu baris tabel ukuran, mis. { ukuran: "L", "lingkar dada (cm)": "110", "panjang (cm)": "105" } */
export const sizeChartSchema = z
  .object({
    columns: z.array(z.string().trim().min(1)).min(2).max(8),
    rows: z.array(z.array(z.string().trim()).min(2).max(8)).min(1).max(20),
    note: optionalText,
  })
  .refine((c) => c.rows.every((r) => r.length === c.columns.length), {
    message: "Setiap baris tabel ukuran harus punya jumlah kolom yang sama dengan header",
    path: ["rows"],
  });

export type SizeChart = z.infer<typeof sizeChartSchema>;

export const productInputSchema = z.object({
  name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120),
  slug: z.string().trim().regex(SLUG_PATTERN, "Slug hanya huruf kecil, angka, dan tanda hubung").max(80).optional(),
  description: z.string().trim().min(1, "Deskripsi wajib diisi").max(5000),
  material: optionalText,
  careInstructions: optionalText,
  sizeChart: sizeChartSchema.nullish(),
  categoryId: z.string().uuid(),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(160).optional(),
});

export type ProductInput = z.input<typeof productInputSchema>;

export const variantInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(SKU_PATTERN, "SKU 3–40 karakter: huruf besar, angka, tanda hubung"),
    attributes: z
      .record(z.string(), z.string())
      .refine((a) => Object.values(a).some((v) => v.trim() !== ""), "Minimal satu atribut varian"),
    priceIdr: idr,
    compareAtPriceIdr: idr.nullish(),
    weightGrams: z.number().int().positive("Berat wajib diisi untuk ongkir"),
    lengthCm: z.number().int().positive().nullish(),
    widthCm: z.number().int().positive().nullish(),
    heightCm: z.number().int().positive().nullish(),
    status: z.enum(["active", "inactive"]).default("active"),
    fulfillmentMode: z.enum(["ready_stock", "preorder", "supplier_fulfilled"]).default("ready_stock"),
    fulfillmentSourceId: z.string().uuid(),
    lowStockThreshold: z.number().int().min(0).nullish(),
  })
  .refine((v) => v.compareAtPriceIdr == null || v.compareAtPriceIdr > v.priceIdr, {
    message: "Harga coret harus lebih tinggi dari harga jual (BR-020)",
    path: ["compareAtPriceIdr"],
  });

export type VariantInput = z.input<typeof variantInputSchema>;

/** Parameter listing dari URL (FR-004): bisa kembali tanpa kehilangan hasil. */
export const listingParamsSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  kategori: z.string().regex(SLUG_PATTERN).optional().catch(undefined),
  min: z.coerce.number().int().min(0).optional().catch(undefined),
  max: z.coerce.number().int().min(0).optional().catch(undefined),
  ukuran: z.string().trim().max(20).optional().catch(undefined),
  tersedia: z
    .enum(["1", "0"])
    .optional()
    .transform((v) => v === "1")
    .catch(false),
  urut: z.enum(["terbaru", "termurah", "termahal"]).default("terbaru").catch("terbaru"),
  hal: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

export type ListingParams = z.infer<typeof listingParamsSchema>;

/** Kategori menentukan field wajib sebelum terbit (BR-031). */
export const categoryAttributeSchema = z.object({
  requiredVariantAttributes: z.array(z.string()).default([]),
  requireSizeChart: z.boolean().default(true),
  requireMaterial: z.boolean().default(true),
});

export type CategoryAttributeSchema = z.infer<typeof categoryAttributeSchema>;

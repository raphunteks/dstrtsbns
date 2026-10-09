import { normalizeAttributes } from "./attributes";
import { categoryAttributeSchema, sizeChartSchema } from "./schemas";

/**
 * Syarat produk boleh terbit (FR-007, FR-042, BR-031, DESIGN.md §14.2).
 * Fungsi murni: menerima snapshot produk, mengembalikan daftar masalah berbahasa Indonesia.
 * Daftar kosong = boleh terbit.
 */
export type PublishCandidate = {
  description: string;
  material: string | null;
  careInstructions: string | null;
  sizeChart: unknown;
  categoryStatus: "active" | "hidden";
  categoryAttributeSchema: unknown;
  variants: {
    sku: string;
    status: "active" | "inactive";
    attributes: unknown;
    priceIdr: number;
    weightGrams: number;
  }[];
  media: { altText: string; status: "active" | "hidden" }[];
};

export type PublishIssue = { field: string; message: string };

export function validateForPublish(p: PublishCandidate): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const rules = categoryAttributeSchema.parse(p.categoryAttributeSchema ?? {});

  if (p.categoryStatus !== "active") {
    issues.push({ field: "categoryId", message: "Kategori produk sedang disembunyikan." });
  }
  if (p.description.trim().length < 30) {
    issues.push({ field: "description", message: "Deskripsi terlalu singkat (minimal 30 karakter)." });
  }
  if (rules.requireMaterial && !p.material?.trim()) {
    issues.push({ field: "material", message: "Bahan wajib diisi." });
  }
  if (!p.careInstructions?.trim()) {
    issues.push({ field: "careInstructions", message: "Instruksi perawatan wajib diisi." });
  }
  if (rules.requireSizeChart) {
    if (!p.sizeChart) {
      issues.push({ field: "sizeChart", message: "Tabel ukuran terukur wajib ada (mis. LD, panjang)." });
    } else if (!sizeChartSchema.safeParse(p.sizeChart).success) {
      issues.push({ field: "sizeChart", message: "Tabel ukuran tidak lengkap atau kolomnya tidak konsisten." });
    }
  }

  const activeVariants = p.variants.filter((v) => v.status === "active");
  if (activeVariants.length === 0) {
    issues.push({ field: "variants", message: "Minimal satu varian aktif." });
  }
  for (const v of activeVariants) {
    if (v.weightGrams <= 0) {
      issues.push({ field: `variants.${v.sku}.weightGrams`, message: `Berat ${v.sku} wajib untuk ongkir.` });
    }
    const attrs =
      v.attributes && typeof v.attributes === "object"
        ? normalizeAttributes(v.attributes as Record<string, string>)
        : {};
    for (const required of rules.requiredVariantAttributes) {
      if (!attrs[required.toLowerCase()]) {
        issues.push({
          field: `variants.${v.sku}.attributes.${required}`,
          message: `Varian ${v.sku} belum punya atribut "${required}".`,
        });
      }
    }
  }

  const activeMedia = p.media.filter((m) => m.status === "active");
  if (activeMedia.length === 0) {
    issues.push({ field: "media", message: "Minimal satu foto produk." });
  }
  if (activeMedia.some((m) => m.altText.trim().length < 5)) {
    issues.push({ field: "media", message: "Setiap foto wajib punya teks alternatif yang menjelaskan motif/warna." });
  }

  return issues;
}

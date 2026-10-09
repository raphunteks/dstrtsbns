/**
 * Utilitas murni katalog — tanpa akses DB, aman diuji unit.
 */

/** "Daster Rayon  Harian!" → "daster-rayon-harian" */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Rapikan atribut varian: nama kunci huruf kecil, nilai dipangkas, spasi ganda dihapus. */
export function normalizeAttributes(attributes: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(attributes)) {
    const key = rawKey.trim().toLowerCase().replace(/\s+/g, "_");
    const value = rawValue.trim().replace(/\s+/g, " ");
    if (!key || !value) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Kunci kombinasi yang tidak ambigu (FR-044): urut abjad, huruf kecil.
 * { warna: "Navy", ukuran: "L" } → "ukuran=l|warna=navy"
 */
export function attributeKey(attributes: Record<string, string>): string {
  const normalized = normalizeAttributes(attributes);
  return Object.keys(normalized)
    .sort()
    .map((key) => `${key}=${normalized[key]!.toLowerCase()}`)
    .join("|");
}

export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

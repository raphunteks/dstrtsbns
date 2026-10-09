import { listingParamsSchema, type ListingParams } from "@/server/modules/catalog/schemas";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Ambil nilai pertama per kunci lalu validasi (nilai tak valid jatuh ke default, FR-004). */
export async function parseListing(searchParams: SearchParams, overrides: Partial<ListingParams> = {}): Promise<ListingParams> {
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return { ...listingParamsSchema.parse(flat), ...overrides };
}

export const STORE_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL", "All size"] as const;

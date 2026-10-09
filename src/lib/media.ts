import { publicEnv } from "@/lib/public-env";

/** URL publik foto produk dari bucket "produk" Supabase Storage. */
export function productImageUrl(objectKey: string): string {
  const key = objectKey.replace(/^\/+/, "");
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/produk/${encodeURI(key)}`;
}

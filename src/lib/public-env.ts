/**
 * Variabel NEXT_PUBLIC_* — aman untuk browser.
 * Harus ditulis sebagai akses literal agar Next.js bisa menanamkannya saat build.
 * Catatan VPS: nilai ini dibekukan saat `next build`, jadi image Docker dibuat per environment.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "",
} as const;

export function assertPublicEnv() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/ANON_KEY wajib diisi",
    );
  }
  return publicEnv;
}

import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { assertPublicEnv } from "@/lib/public-env";

/**
 * Klien Supabase per-request untuk Server Component / Server Action / Route Handler.
 * Memakai anon/publishable key + sesi cookie pengguna, jadi tunduk pada RLS.
 * Dipakai untuk autentikasi saja; hak akses (RBAC §11) diperiksa di server dari tabel app.*.
 */
export async function getSupabaseServer() {
  const { supabaseUrl, supabaseAnonKey } = assertPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Dipanggil dari Server Component: cookie tidak bisa ditulis di sini.
          // middleware.ts yang menyegarkan sesi, jadi aman diabaikan.
        }
      },
    },
  });
}

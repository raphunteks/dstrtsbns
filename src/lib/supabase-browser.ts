"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertPublicEnv } from "@/lib/public-env";

/**
 * Klien browser hanya untuk alur autentikasi (masuk, daftar, MFA).
 * Jangan dipakai membaca tabel: data aplikasi selalu lewat server (SEC-012).
 */
export function getSupabaseBrowser() {
  const { supabaseUrl, supabaseAnonKey } = assertPublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

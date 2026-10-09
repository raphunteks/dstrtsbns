import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/server/env";

/**
 * Klien Supabase dengan secret/service-role key — MELEWATI SEMUA RLS.
 * Hanya untuk operasi server tepercaya: Storage (signed upload URL), admin auth.
 * Data aplikasi tetap lewat Prisma (schema "app"), bukan lewat klien ini.
 */
let adminClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const env = getEnv();
  adminClient = createClient(env.SUPABASE_URL, env.supabaseServerKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

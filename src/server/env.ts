import "server-only";
import { z } from "zod";

/**
 * Satu-satunya tempat membaca rahasia (SEC-006).
 * Validasi bersifat lazy: dijalankan saat getEnv() pertama kali dipanggil,
 * supaya `next build` tidak gagal di CI yang belum punya rahasia.
 * Kunci Pakasir, RajaOngkir Cost, dan Komerce Delivery sengaja terpisah (BR-037, SEC-012).
 */

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

function hasAppSchema(url: string): boolean {
  try {
    return new URL(url).searchParams.get("schema") === "app";
  } catch {
    return false;
  }
}

const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().transform((v) => v.replace(/\/+$/, "")),
    DEPLOY_TARGET: z.enum(["vercel", "vps"]).default("vercel"),
    CRON_SECRET: z.string().min(32, "CRON_SECRET minimal 32 karakter"),
    // Kunci HMAC untuk link akses pesanan guest (FR-028). Ganti = semua link lama tidak berlaku.
    APP_SECRET: z.string().min(32, "APP_SECRET minimal 32 karakter"),
    STORE_TIMEZONE: z.string().default("Asia/Makassar"),

    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    SUPABASE_JWT_SECRET: optionalString,

    // WAJIB memuat ?schema=app — tanpa itu Prisma menulis ke schema public yang diekspos Data API.
    POSTGRES_PRISMA_URL: z.string().min(1).refine(hasAppSchema, "harus memuat parameter ?schema=app"),
    POSTGRES_URL_NON_POOLING: z
      .string()
      .min(1)
      .refine(hasAppSchema, "harus memuat parameter ?schema=app"),

    PAKASIR_BASE_URL: z.string().url().default("https://app.pakasir.com/api/v2"),
    PAKASIR_PROJECT_SLUG: optionalString,
    PAKASIR_API_KEY: optionalString,
    PAKASIR_WEBHOOK_SECRET: optionalString,
    PAKASIR_IS_SANDBOX: bool,

    RAJAONGKIR_COST_BASE_URL: z.string().url().default("https://rajaongkir.komerce.id/api/v1"),
    RAJAONGKIR_COST_API_KEY: optionalString,

    KOMERCE_DELIVERY_ENABLED: bool,
    KOMERCE_DELIVERY_BASE_URL: z
      .string()
      .url()
      .default("https://api-sandbox.collaborator.komerce.id"),
    KOMERCE_DELIVERY_API_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    if (!env.SUPABASE_SECRET_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SUPABASE_SECRET_KEY"],
        message: "Isi SUPABASE_SECRET_KEY atau SUPABASE_SERVICE_ROLE_KEY",
      });
    }
    if (env.KOMERCE_DELIVERY_ENABLED && !env.KOMERCE_DELIVERY_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["KOMERCE_DELIVERY_API_KEY"],
        message: "KOMERCE_DELIVERY_ENABLED=true tetapi API key kosong (OD-013)",
      });
    }
  })
  .transform((env) => ({
    ...env,
    supabaseServerKey: (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY) as string,
  }));

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    // Pesan hanya menyebut NAMA variabel, tidak pernah nilainya.
    throw new Error(`Konfigurasi environment tidak valid:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Fitur integrasi wajib punya kredensial sebelum dipakai (NFR-020). */
export function requirePakasir() {
  const env = getEnv();
  if (!env.PAKASIR_PROJECT_SLUG || !env.PAKASIR_API_KEY || !env.PAKASIR_WEBHOOK_SECRET) {
    throw new Error("Pakasir belum dikonfigurasi (OD-014): slug, API key, dan webhook secret wajib diisi");
  }
  return {
    baseUrl: env.PAKASIR_BASE_URL,
    slug: env.PAKASIR_PROJECT_SLUG,
    apiKey: env.PAKASIR_API_KEY,
    webhookSecret: env.PAKASIR_WEBHOOK_SECRET,
    isSandbox: env.PAKASIR_IS_SANDBOX,
  };
}

export function requireRajaOngkirCost() {
  const env = getEnv();
  if (!env.RAJAONGKIR_COST_API_KEY) {
    throw new Error("RajaOngkir Shipping Cost belum dikonfigurasi: RAJAONGKIR_COST_API_KEY kosong");
  }
  return { baseUrl: env.RAJAONGKIR_COST_BASE_URL, apiKey: env.RAJAONGKIR_COST_API_KEY };
}

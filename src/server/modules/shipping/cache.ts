import "server-only";
import type { Prisma } from "@prisma/client";
import type { Db } from "@/server/db/types";

export async function readCache<T>(db: Db, key: string, now = new Date()): Promise<T | null> {
  const row = await db.providerCache.findUnique({ where: { key } });
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  return row.value as T;
}

/** Upsert atomik (ON CONFLICT) — aman saat banyak checkout menulis kunci yang sama bersamaan. */
export async function writeCache(db: Db, key: string, value: Prisma.InputJsonValue, ttlMs: number) {
  const expiresAt = new Date(Date.now() + ttlMs);
  const json = JSON.stringify(value);
  await db.$executeRaw`
    INSERT INTO "app"."ProviderCache" ("key", "value", "expiresAt")
    VALUES (${key}, ${json}::jsonb, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "expiresAt" = EXCLUDED."expiresAt"`;
}

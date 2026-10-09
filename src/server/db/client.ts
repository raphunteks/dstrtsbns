import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Satu PrismaClient per proses.
 * - Vercel (serverless): pakai POSTGRES_PRISMA_URL dengan `?pgbouncer=true&connection_limit=1`.
 * - VPS (proses panjang): connection_limit boleh lebih besar, diatur di URL yang sama.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

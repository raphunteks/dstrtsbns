import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Klien yang bisa berupa db utama atau transaksi interaktif. */
export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

/** Opsi transaksi untuk operasi yang bisa antre di bawah beban (checkout, reservasi). */
export const contendedTx = {
  maxWait: 15_000,
  timeout: 15_000,
  isolationLevel: "ReadCommitted",
} as const satisfies { maxWait: number; timeout: number; isolationLevel: Prisma.TransactionIsolationLevel };

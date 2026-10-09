import "server-only";
import type { PrismaClient } from "@prisma/client";
import { DomainError } from "@/server/errors";
import type { PakasirClient } from "@/server/integrations/pakasir/client";

export type PaymentConfig = {
  slug: string;
  webhookSecret: string;
  isSandbox: boolean;
  appUrl: string;
};

export type PaymentDeps = {
  db: PrismaClient;
  pakasir: PakasirClient | null;
  config: PaymentConfig | null;
  now?: () => Date;
};

export const clock = (deps: PaymentDeps) => (deps.now ? deps.now() : new Date());

export class PaymentNotAllowedError extends DomainError {
  constructor(reason: "not_configured" | "method_disabled" | "amount_out_of_range" | "order_not_payable") {
    const messages = {
      not_configured: "Pembayaran online belum aktif. Silakan hubungi admin toko.",
      method_disabled: "Metode pembayaran ini belum tersedia.",
      amount_out_of_range: "Total belanja di luar batas metode pembayaran ini. Pilih metode lain.",
      order_not_payable: "Pesanan ini sudah tidak menunggu pembayaran.",
    } as const;
    super("payment_not_allowed", messages[reason], { reason });
    this.name = "PaymentNotAllowedError";
  }
}

/** Sidik jari yang sama untuk webhook dan polling status → satu event diproses sekali. */
export function completionFingerprint(p: { txn_id: string; order_id: string; amount: number; status: string }) {
  return `pakasir:${p.txn_id}:${p.order_id}:${p.amount}:${p.status}`;
}

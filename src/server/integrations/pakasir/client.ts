import "server-only";
import { z } from "zod";
import { ProviderError, providerRequest, type FetchLike } from "../http";

/**
 * Pakasir API v2 — https://app.pakasir.com/api/v2 (v1 dihentikan 20 Okt 2026, jangan dipakai).
 * Sumber kontrak: pakasir.com/p/create-transaction, /transaction-status, /cancel-transaction, /webhook.
 * Header `X-Api-Key`. Dipanggil hanya dari server (SEC-006).
 */

const PROVIDER = "pakasir";

export const PAKASIR_METHODS = [
  "payment_link",
  "qris",
  "bri_va",
  "bni_va",
  "cimb_niaga_va",
  "permata_va",
  "maybank_va",
  "bnc_va",
  "artha_graha_va",
  "sampoerna_va",
] as const;

export type PakasirMethod = (typeof PAKASIR_METHODS)[number];

/** Batas nominal per metode menurut dokumentasi create-transaction. */
export function amountLimits(method: PakasirMethod): { min: number; max: number } {
  if (method === "payment_link") return { min: 500, max: 50_000_000 };
  if (method === "qris") return { min: 500, max: 10_000_000 };
  return { min: 10_000, max: 50_000_000 };
}

const createLinkSchema = z.object({ txn_id: z.string().min(1), payment_link: z.string().url() });

const createDirectSchema = z.object({
  txn_id: z.string().min(1),
  order_id: z.string().optional(),
  amount: z.number().int().optional(),
  fee: z.number().int().nullish(),
  total_payment: z.number().int().nullish(),
  payment_method: z.string().optional(),
  qr_string: z.string().nullish(),
  va_number: z.string().nullish(),
  expired_at: z.string().nullish(),
  is_sandbox: z.boolean().optional(),
});

export const pakasirStatusSchema = z.object({
  txn_id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int(),
  is_sandbox: z.boolean(),
  status: z.enum(["pending", "completed", "canceled"]),
  completed_at: z.string().nullish(),
});

/** Payload webhook sama bentuknya dengan respons status (docs /webhook). */
export const pakasirWebhookSchema = pakasirStatusSchema;

export type PakasirStatus = z.infer<typeof pakasirStatusSchema>;

export type CreatedTransaction = {
  txnId: string;
  paymentUrl: string | null;
  qrString: string | null;
  vaNumber: string | null;
  feeIdr: number | null;
  totalPaymentIdr: number | null;
  expiresAt: Date | null;
};

export type PakasirClient = {
  createTransaction(input: { providerOrderId: string; method: PakasirMethod; amountIdr: number }): Promise<CreatedTransaction>;
  getStatus(txnId: string): Promise<PakasirStatus>;
  cancel(txnId: string): Promise<void>;
};

export function createPakasirClient(config: {
  baseUrl: string;
  slug: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}): PakasirClient {
  const base = config.baseUrl.replace(/\/+$/, "");
  const slug = encodeURIComponent(config.slug);
  const headers = { "X-Api-Key": config.apiKey, Accept: "application/json" };

  return {
    async createTransaction({ providerOrderId, method, amountIdr }) {
      const { min, max } = amountLimits(method);
      if (!Number.isSafeInteger(amountIdr) || amountIdr < min || amountIdr > max) {
        throw new ProviderError(PROVIDER, "bad_request", null, `Nominal di luar batas metode ${method}`);
      }
      const { status, body } = await providerRequest({
        provider: PROVIDER,
        url: `${base}/create-transaction/${slug}/${encodeURIComponent(providerOrderId)}`,
        init: {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ method, amount: amountIdr }),
        },
        fetchImpl: config.fetchImpl,
        timeoutMs: 15_000,
      });
      if (status < 200 || status >= 300) {
        throw new ProviderError(PROVIDER, "bad_request", status, "Gagal membuat transaksi Pakasir");
      }
      if (method === "payment_link") {
        const parsed = createLinkSchema.safeParse(body);
        if (!parsed.success) throw new ProviderError(PROVIDER, "invalid_response", status, "Respons payment link tidak dikenali");
        return {
          txnId: parsed.data.txn_id,
          paymentUrl: parsed.data.payment_link,
          qrString: null,
          vaNumber: null,
          feeIdr: null,
          totalPaymentIdr: null,
          expiresAt: null,
        };
      }
      const parsed = createDirectSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(PROVIDER, "invalid_response", status, "Respons transaksi tidak dikenali");
      const d = parsed.data;
      const expires = d.expired_at ? new Date(d.expired_at) : null;
      return {
        txnId: d.txn_id,
        paymentUrl: null,
        qrString: d.qr_string ?? null,
        vaNumber: d.va_number ?? null,
        feeIdr: d.fee ?? null,
        totalPaymentIdr: d.total_payment ?? null,
        expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null,
      };
    },

    async getStatus(txnId) {
      const { status, body } = await providerRequest({
        provider: PROVIDER,
        url: `${base}/transaction-status/${slug}/${encodeURIComponent(txnId)}`,
        init: { method: "GET", headers },
        fetchImpl: config.fetchImpl,
        retries: 1,
      });
      if (status === 404) throw new ProviderError(PROVIDER, "not_found", status, "Transaksi tidak ditemukan");
      if (status !== 200) throw new ProviderError(PROVIDER, "bad_request", status, "Gagal cek status");
      const parsed = pakasirStatusSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(PROVIDER, "invalid_response", status, "Respons status tidak dikenali");
      return parsed.data;
    },

    async cancel(txnId) {
      const { status } = await providerRequest({
        provider: PROVIDER,
        url: `${base}/cancel-transaction/${slug}/${encodeURIComponent(txnId)}`,
        init: { method: "POST", headers },
        fetchImpl: config.fetchImpl,
        retries: 1,
      });
      if (status < 200 || status >= 300) {
        throw new ProviderError(PROVIDER, "bad_request", status, "Gagal membatalkan transaksi");
      }
    },
  };
}

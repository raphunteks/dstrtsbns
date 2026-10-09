import { describe, expect, it, vi } from "vitest";
import { amountLimits, createPakasirClient, pakasirWebhookSchema } from "./client";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("kontrak Pakasir v2", () => {
  it("create payment_link: POST /create-transaction/{slug}/{order_id}, X-Api-Key, body {method, amount}", async () => {
    const fetchImpl = vi.fn((_u: string, _i?: RequestInit) =>
      json(200, { txn_id: "vwiqpcriq", payment_link: "https://app.pakasir.com/pay-v2/vwiqpcriq" }),
    );
    const client = createPakasirClient({ baseUrl: "https://app.pakasir.com/api/v2/", slug: "toko", apiKey: "KUNCI", fetchImpl });
    const res = await client.createTransaction({ providerOrderId: "DTS-ABCD1234-1", method: "payment_link", amountIdr: 196000 });

    expect(res).toMatchObject({ txnId: "vwiqpcriq", paymentUrl: "https://app.pakasir.com/pay-v2/vwiqpcriq", feeIdr: null });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://app.pakasir.com/api/v2/create-transaction/toko/DTS-ABCD1234-1");
    expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe("KUNCI");
    expect(JSON.parse(String(init?.body))).toEqual({ method: "payment_link", amount: 196000 });
  });

  it("create QRIS mem-parse fee, total, qr_string, expired_at", async () => {
    const client = createPakasirClient({
      baseUrl: "https://p.test",
      slug: "toko",
      apiKey: "k",
      fetchImpl: () =>
        json(200, {
          txn_id: "t1",
          project: "toko",
          order_id: "DTS-1",
          amount: 99000,
          fee: 1003,
          total_payment: 100003,
          payment_method: "qris",
          qr_string: "000201",
          expired_at: "2026-10-10T01:00:00Z",
          is_sandbox: true,
        }),
    });
    const res = await client.createTransaction({ providerOrderId: "DTS-1", method: "qris", amountIdr: 99000 });
    expect(res).toMatchObject({ txnId: "t1", feeIdr: 1003, totalPaymentIdr: 100003, qrString: "000201" });
    expect(res.expiresAt?.toISOString()).toBe("2026-10-10T01:00:00.000Z");
  });

  it("menolak nominal di luar batas metode sebelum memanggil provider", async () => {
    const fetchImpl = vi.fn();
    const client = createPakasirClient({ baseUrl: "https://p.test", slug: "s", apiKey: "k", fetchImpl });
    await expect(client.createTransaction({ providerOrderId: "x", method: "bri_va", amountIdr: 9000 })).rejects.toMatchObject({
      kind: "bad_request",
    });
    await expect(client.createTransaction({ providerOrderId: "x", method: "qris", amountIdr: 10_000_001 })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(amountLimits("payment_link")).toEqual({ min: 500, max: 50_000_000 });
  });

  it("status & webhook: hanya pending/completed/canceled yang dikenali", async () => {
    const payload = {
      txn_id: "vwiqpcriq",
      order_id: "INV123123",
      amount: 99000,
      is_sandbox: false,
      status: "completed",
      completed_at: "2025-09-19T01:18:49.678622564Z",
    };
    expect(pakasirWebhookSchema.parse(payload)).toEqual(payload);
    expect(pakasirWebhookSchema.safeParse({ ...payload, status: "paid" }).success).toBe(false);
    expect(pakasirWebhookSchema.safeParse({ ...payload, amount: "99000" }).success).toBe(false);

    const client = createPakasirClient({ baseUrl: "https://p.test", slug: "s", apiKey: "k", fetchImpl: () => json(200, payload) });
    await expect(client.getStatus("vwiqpcriq")).resolves.toMatchObject({ status: "completed" });
  });

  it("401 tidak di-retry", async () => {
    const fetchImpl = vi.fn(() => json(401, {}));
    const client = createPakasirClient({ baseUrl: "https://p.test", slug: "s", apiKey: "salah", fetchImpl });
    await expect(client.getStatus("t")).rejects.toMatchObject({ kind: "auth" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

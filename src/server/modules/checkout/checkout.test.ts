import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/integrations/http";
import { createRajaOngkirClient } from "@/server/integrations/rajaongkir-cost/client";
import { allocate, computeDiscount, type CouponRule } from "@/server/modules/coupons/discount";
import { generatePublicNumber, guestAccessToken } from "@/server/modules/orders/identifiers";
import { packageWeightGrams } from "@/server/modules/shipping/quotes";
import { contactSchema, normalizeIndonesianPhone } from "./schemas";

const now = new Date("2026-10-10T00:00:00Z");
const rule = (over: Partial<CouponRule> = {}): CouponRule => ({
  type: "percentage",
  value: 1000,
  minSubtotalIdr: null,
  maxDiscountIdr: null,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-11-01T00:00:00Z"),
  active: true,
  eligibility: {},
  ...over,
});
const lines = [
  { variantId: "v1", categoryId: "daster", lineSubtotalIdr: 178000 },
  { variantId: "v2", categoryId: "piyama", lineSubtotalIdr: 149000 },
];

describe("kupon (BR-006, FR-022)", () => {
  it("persen dibulatkan ke bawah, alokasi per baris tepat sama dengan total", () => {
    const r = computeDiscount(rule({ value: 1000 }), lines, now);
    expect(r).toMatchObject({ ok: true, discountIdr: 32700 });
    if (r.ok) expect(r.perLine.reduce((a, b) => a + b, 0)).toBe(32700);
  });

  it("batas maksimum, minimum belanja, dan masa berlaku", () => {
    expect(computeDiscount(rule({ maxDiscountIdr: 10000 }), lines, now)).toMatchObject({ discountIdr: 10000 });
    expect(computeDiscount(rule({ minSubtotalIdr: 500000 }), lines, now)).toEqual({ ok: false, reason: "min_subtotal" });
    expect(computeDiscount(rule({ endsAt: now }), lines, now)).toEqual({ ok: false, reason: "ended" });
    expect(computeDiscount(rule({ active: false }), lines, now)).toEqual({ ok: false, reason: "inactive" });
  });

  it("hanya produk eligible yang mendapat diskon", () => {
    const r = computeDiscount(rule({ type: "fixed_amount", value: 20000, eligibility: { categoryIds: ["piyama"] } }), lines, now);
    expect(r).toEqual({ ok: true, discountIdr: 20000, perLine: [0, 20000] });
    expect(computeDiscount(rule({ eligibility: { categoryIds: ["tunik"] } }), lines, now)).toEqual({
      ok: false,
      reason: "not_eligible",
    });
  });

  it("diskon nominal tidak melebihi nilai produk eligible", () => {
    const r = computeDiscount(rule({ type: "fixed_amount", value: 999999 }), lines, now);
    expect(r).toMatchObject({ ok: true, discountIdr: 327000 });
  });

  it("alokasi sisa terbesar tidak pernah melebihi bobot baris", () => {
    expect(allocate(10, [100, 100, 100])).toEqual([4, 3, 3]);
    expect(allocate(3, [0, 3])).toEqual([0, 3]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    const parts = allocate(32701, [178000, 149000]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(32701);
  });
});

describe("kontak & alamat (FR-015, FR-016)", () => {
  it("menormalkan nomor ponsel Indonesia", () => {
    expect(normalizeIndonesianPhone("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizeIndonesianPhone("62 812 3456 789")).toBe("+628123456789");
    expect(normalizeIndonesianPhone("+6281234567890")).toBe("+6281234567890");
    expect(normalizeIndonesianPhone("021-123456")).toBeNull();
    expect(normalizeIndonesianPhone("12345")).toBeNull();
  });

  it("email boleh kosong, ponsel wajib valid", () => {
    expect(contactSchema.safeParse({ name: "Sari", email: "", phone: "081234567890" }).success).toBe(true);
    expect(contactSchema.safeParse({ name: "Sari", phone: "123" }).success).toBe(false);
    const parsed = contactSchema.parse({ name: "Sari", phone: "081234567890" });
    expect(parsed.marketingOptIn).toBe(false); // opt-in tidak pernah default aktif
  });
});

describe("identitas pesanan", () => {
  it("nomor publik acak berformat DTS-XXXXXXXX tanpa huruf ambigu", () => {
    const numbers = new Set(Array.from({ length: 200 }, generatePublicNumber));
    expect(numbers.size).toBe(200);
    for (const n of numbers) expect(n).toMatch(/^DTS-[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("token guest deterministik per order, berbeda antar order", () => {
    const s = "x".repeat(32);
    expect(guestAccessToken(s, "a")).toBe(guestAccessToken(s, "a"));
    expect(guestAccessToken(s, "a")).not.toBe(guestAccessToken(s, "b"));
  });

  it("berat paket", () => {
    expect(packageWeightGrams([{ weightGrams: 300, quantity: 2 }, { weightGrams: 250, quantity: 1 }])).toBe(850);
  });
});

describe("kontrak RajaOngkir Shipping Cost", () => {
  const json = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("mengirim header key & form-urlencoded, mem-parse layanan, membuang ongkir 0", async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      json(200, {
        meta: { message: "ok", code: 200, status: "success" },
        data: [
          { name: "JNE", code: "jne", service: "REG", description: "Layanan Reguler", cost: 18000, etd: "2-3 day" },
          { name: "JNE", code: "jne", service: "BUG", description: "x", cost: 0, etd: null },
        ],
      }),
    );
    const client = createRajaOngkirClient({ baseUrl: "https://ro.test/api/v1/", apiKey: "KUNCI", fetchImpl });
    const options = await client.calculateDomesticCost({ originId: "1", destinationId: "2", weightGrams: 600, courier: "jne" });

    expect(options).toEqual([
      { courierCode: "jne", courierName: "JNE", serviceCode: "REG", description: "Layanan Reguler", costIdr: 18000, etd: "2-3 day" },
    ]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ro.test/api/v1/calculate/domestic-cost");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).key).toBe("KUNCI");
    expect(String(init?.body)).toBe("origin=1&destination=2&weight=600&courier=jne");
  });

  it("400 (rute tidak dilayani) → daftar kosong, bukan ongkir 0", async () => {
    const client = createRajaOngkirClient({
      baseUrl: "https://ro.test",
      apiKey: "k",
      fetchImpl: () => json(400, { meta: { code: 400 }, data: null }),
    });
    await expect(client.calculateDomesticCost({ originId: "1", destinationId: "2", weightGrams: 1, courier: "jne" })).resolves.toEqual([]);
  });

  it("401 tidak di-retry; 500 di-retry terbatas", async () => {
    const auth = vi.fn(() => json(401, {}));
    const c1 = createRajaOngkirClient({ baseUrl: "https://ro.test", apiKey: "k", fetchImpl: auth });
    await expect(c1.searchDestinations("makassar")).rejects.toMatchObject({ kind: "auth" });
    expect(auth).toHaveBeenCalledTimes(1);

    const down = vi.fn(() => json(503, {}));
    const c2 = createRajaOngkirClient({ baseUrl: "https://ro.test", apiKey: "k", fetchImpl: down });
    await expect(c2.searchDestinations("makassar")).rejects.toBeInstanceOf(ProviderError);
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("mem-parse destinasi (id angka → string)", async () => {
    const client = createRajaOngkirClient({
      baseUrl: "https://ro.test",
      apiKey: "k",
      fetchImpl: () =>
        json(200, {
          meta: { code: 200 },
          data: [
            {
              id: 1234,
              label: "PANAKKUKANG, MAKASSAR, SULAWESI SELATAN, 90231",
              province_name: "SULAWESI SELATAN",
              city_name: "MAKASSAR",
              district_name: "PANAKKUKANG",
              subdistrict_name: "PANAKKUKANG",
              zip_code: "90231",
            },
          ],
        }),
    });
    const [d] = await client.searchDestinations("panakkukang");
    expect(d).toMatchObject({ id: "1234", cityName: "MAKASSAR", zipCode: "90231" });
  });
});

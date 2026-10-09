import "server-only";
import { z } from "zod";
import { ProviderError, providerRequest, type FetchLike } from "../http";

/**
 * RajaOngkir Shipping Cost (Komerce) — https://rajaongkir.komerce.id/api/v1
 * Header `key` = API key Shipping Cost (BUKAN key Shipping Delivery, BR-037).
 * Dipanggil hanya dari server (SEC-012).
 */

const PROVIDER = "rajaongkir-cost";

const metaSchema = z.object({
  message: z.string().optional(),
  code: z.number().optional(),
  status: z.string().optional(),
});

const destinationSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  label: z.string(),
  province_name: z.string().nullish(),
  city_name: z.string().nullish(),
  district_name: z.string().nullish(),
  subdistrict_name: z.string().nullish(),
  zip_code: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v))),
});

const costSchema = z.object({
  name: z.string(),
  code: z.string(),
  service: z.string(),
  description: z.string().nullish(),
  cost: z.number(),
  etd: z.string().nullish(),
});

const envelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ meta: metaSchema, data: z.array(item).nullable() });

export type Destination = {
  id: string;
  label: string;
  provinceName: string | null;
  cityName: string | null;
  districtName: string | null;
  subdistrictName: string | null;
  zipCode: string | null;
};

export type ShippingOption = {
  courierCode: string;
  courierName: string;
  serviceCode: string;
  description: string | null;
  costIdr: number;
  etd: string | null;
};

const trackingSchema = z.object({
  meta: metaSchema,
  data: z
    .object({
      delivered: z.boolean(),
      summary: z.object({ status: z.string().nullish() }).partial().nullish(),
      delivery_status: z
        .object({ status: z.string().nullish(), pod_date: z.string().nullish(), pod_time: z.string().nullish() })
        .partial()
        .nullish(),
    })
    .nullable(),
});

export type WaybillTracking = { delivered: boolean; status: string | null; podDate: string | null };

export type RajaOngkirClient = Pick<
  ReturnType<typeof createRajaOngkirClient>,
  "searchDestinations" | "calculateDomesticCost"
> &
  Partial<Pick<ReturnType<typeof createRajaOngkirClient>, "trackWaybill">>;

export function createRajaOngkirClient(config: { baseUrl: string; apiKey: string; fetchImpl?: FetchLike }) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const headers = { key: config.apiKey, Accept: "application/json" };

  return {
    /** Cari ID wilayah (kecamatan/kelurahan/kode pos) — FR-084. */
    async searchDestinations(query: string, limit = 10): Promise<Destination[]> {
      const url = `${base}/destination/domestic-destination?${new URLSearchParams({
        search: query,
        limit: String(limit),
        offset: "0",
      })}`;
      const { status, body } = await providerRequest({
        provider: PROVIDER,
        url,
        init: { method: "GET", headers },
        fetchImpl: config.fetchImpl,
      });
      if (status === 404) return [];
      if (status !== 200) throw new ProviderError(PROVIDER, "bad_request", status, "Pencarian wilayah gagal");
      const parsed = envelope(destinationSchema).safeParse(body);
      if (!parsed.success) throw new ProviderError(PROVIDER, "invalid_response", status, "Format wilayah tidak dikenali");
      return (parsed.data.data ?? []).map((d) => ({
        id: d.id,
        label: d.label,
        provinceName: d.province_name ?? null,
        cityName: d.city_name ?? null,
        districtName: d.district_name ?? null,
        subdistrictName: d.subdistrict_name ?? null,
        zipCode: d.zip_code,
      }));
    },

    /**
     * Ongkir domestik untuk SATU kurir (FR-085). Dokumentasi tidak menjelaskan format
     * multi-kurir, jadi pemanggil menjalankan satu permintaan per kurir.
     * 400 "tidak ditemukan" = kurir tidak melayani rute → [] (bukan ongkir 0).
     */
    async calculateDomesticCost(input: {
      originId: string;
      destinationId: string;
      weightGrams: number;
      courier: string;
    }): Promise<ShippingOption[]> {
      if (!Number.isSafeInteger(input.weightGrams) || input.weightGrams <= 0) {
        throw new ProviderError(PROVIDER, "bad_request", null, "Berat paket tidak valid");
      }
      const { status, body } = await providerRequest({
        provider: PROVIDER,
        url: `${base}/calculate/domestic-cost`,
        init: {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            origin: input.originId,
            destination: input.destinationId,
            weight: String(input.weightGrams),
            courier: input.courier,
          }).toString(),
        },
        fetchImpl: config.fetchImpl,
      });
      if (status === 400 || status === 404) return [];
      if (status === 422) {
        throw new ProviderError(PROVIDER, "bad_request", status, `Kode kurir tidak valid: ${input.courier}`);
      }
      if (status !== 200) throw new ProviderError(PROVIDER, "bad_request", status, "Hitung ongkir gagal");
      const parsed = envelope(costSchema).safeParse(body);
      if (!parsed.success) throw new ProviderError(PROVIDER, "invalid_response", status, "Format ongkir tidak dikenali");

      return (parsed.data.data ?? [])
        .filter((o) => Number.isSafeInteger(o.cost) && o.cost > 0) // ongkir 0 dari provider dianggap tidak valid
        .map((o) => ({
          courierCode: o.code.toLowerCase(),
          courierName: o.name,
          serviceCode: o.service,
          description: o.description ?? null,
          costIdr: o.cost,
          etd: o.etd ?? null,
        }));
    },

    /**
     * Lacak resi (FR-086). Dokumentasi tidak konsisten soal letak parameter (query vs form),
     * jadi dikirim di keduanya. Beberapa kurir (mis. JNE) butuh 5 digit terakhir telepon penerima.
     * null = resi tidak ditemukan (404).
     */
    async trackWaybill(input: { waybill: string; courier: string; lastPhoneDigits?: string }): Promise<WaybillTracking | null> {
      const params = new URLSearchParams({ awb: input.waybill, courier: input.courier });
      if (input.lastPhoneDigits) params.set("last_phone_number", input.lastPhoneDigits);
      const { status, body } = await providerRequest({
        provider: PROVIDER,
        url: `${base}/track/waybill?${params}`,
        init: {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        },
        fetchImpl: config.fetchImpl,
        retries: 1,
      });
      if (status === 404) return null;
      if (status !== 200) throw new ProviderError(PROVIDER, "bad_request", status, "Lacak resi gagal");
      const parsed = trackingSchema.safeParse(body);
      if (!parsed.success || !parsed.data.data) {
        throw new ProviderError(PROVIDER, "invalid_response", status, "Format lacak resi tidak dikenali");
      }
      const d = parsed.data.data;
      return {
        delivered: d.delivered,
        status: d.delivery_status?.status ?? d.summary?.status ?? null,
        podDate: d.delivery_status?.pod_date ?? null,
      };
    },
  };
}

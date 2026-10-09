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

export type RajaOngkirClient = ReturnType<typeof createRajaOngkirClient>;

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
  };
}

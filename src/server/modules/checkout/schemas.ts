import { z } from "zod";

/** "0812-3456-7890" / "62812…" / "+62 812…" → "+62812…". null bila bukan nomor ponsel Indonesia. */
export function normalizeIndonesianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let national: string;
  if (digits.startsWith("+62")) national = digits.slice(3);
  else if (digits.startsWith("62")) national = digits.slice(2);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else return null;
  if (!/^8\d{7,11}$/.test(national)) return null;
  return `+62${national}`;
}

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const normalized = normalizeIndonesianPhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nomor ponsel tidak valid, mis. 0812xxxxxxxx" });
      return z.NEVER;
    }
    return normalized;
  });

/** FR-015: kontak aktif + identitas penerima wajib, akun tidak wajib. */
export const contactSchema = z.object({
  name: z.string().trim().min(2, "Nama wajib diisi").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Format email tidak valid")
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone,
  marketingOptIn: z.boolean().default(false), // terpisah dari syarat transaksi (FR-034)
});

/** FR-016: alamat lengkap + ID wilayah tervalidasi dari RajaOngkir (FR-084). */
export const addressSchema = z.object({
  recipientName: z.string().trim().min(2, "Nama penerima wajib diisi").max(80),
  phone,
  provinceName: z.string().trim().min(2).max(80),
  cityName: z.string().trim().min(2).max(80),
  districtName: z.string().trim().min(2).max(80),
  subdistrictName: z.string().trim().max(80).optional(),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Kode pos 5 digit")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  street: z.string().trim().min(5, "Alamat jalan terlalu singkat").max(300),
  landmark: z.string().trim().max(150).optional(),
  destinationId: z.string().trim().min(1, "Pilih kecamatan/kelurahan dari daftar"),
  destinationLabel: z.string().trim().min(3).max(200),
});

export const placeOrderSchema = z.object({
  cartId: z.string().uuid(),
  groupKey: z.string().min(3),
  contact: contactSchema,
  address: addressSchema,
  shipping: z.object({ courierCode: z.string().min(2).max(20), serviceCode: z.string().min(1).max(40) }),
  couponCode: z.string().trim().max(40).optional(),
  expectedTotalIdr: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
  userId: z.string().uuid().nullish(),
});

export type PlaceOrderInput = z.input<typeof placeOrderSchema>;
export type ContactInput = z.output<typeof contactSchema>;
export type AddressInput = z.output<typeof addressSchema>;

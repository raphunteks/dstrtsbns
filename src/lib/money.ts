/**
 * Uang selalu integer rupiah (BR-001). Tidak pernah float.
 * Fungsi di sini menolak nilai non-integer agar bug pembulatan langsung ketahuan.
 */

export type Rupiah = number & { readonly __brand: "Rupiah" };

export function rupiah(value: number): Rupiah {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Nilai rupiah harus integer aman, diterima: ${value}`);
  }
  return value as Rupiah;
}

export function addRupiah(...values: number[]): Rupiah {
  return rupiah(values.reduce((sum, v) => sum + rupiah(v), 0));
}

export function multiplyRupiah(unitPrice: number, quantity: number): Rupiah {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`Kuantitas harus integer ≥ 0, diterima: ${quantity}`);
  }
  return rupiah(rupiah(unitPrice) * quantity);
}

const formatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 89000 → "Rp89.000" (format DESIGN.md §5.2, tanpa spasi). */
export function formatRupiah(value: number): string {
  const v = rupiah(value);
  const sign = v < 0 ? "-" : "";
  return `${sign}Rp${formatter.format(Math.abs(v))}`;
}

/** "Rp89.000" / "89.000" / "89000" → 89000. Untuk input admin. */
export function parseRupiah(input: string): Rupiah {
  const cleaned = input.replace(/[^\d-]/g, "");
  if (!/^-?\d+$/.test(cleaned)) {
    throw new RangeError(`Format rupiah tidak dikenali: "${input}"`);
  }
  return rupiah(Number.parseInt(cleaned, 10));
}

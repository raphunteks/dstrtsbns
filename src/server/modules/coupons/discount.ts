/**
 * Perhitungan kupon murni (BR-006, FR-022). Integer rupiah, tanpa float yang bocor.
 */

export type CouponRule = {
  type: "percentage" | "fixed_amount";
  value: number; // basis point untuk persen (1000 = 10%), rupiah untuk nominal
  minSubtotalIdr: number | null;
  maxDiscountIdr: number | null;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  eligibility: { categoryIds?: string[]; variantIds?: string[] };
};

export type DiscountLine = { variantId: string; categoryId: string; lineSubtotalIdr: number };

export type CouponRejection =
  | "inactive"
  | "not_started"
  | "ended"
  | "min_subtotal"
  | "not_eligible"
  | "usage_limit"
  | "customer_limit";

export const couponRejectionMessage: Record<CouponRejection, string> = {
  inactive: "Kode promo tidak berlaku.",
  not_started: "Kode promo belum berlaku.",
  ended: "Kode promo sudah berakhir.",
  min_subtotal: "Belanja belum mencapai minimum untuk kode ini.",
  not_eligible: "Kode promo tidak berlaku untuk produk di keranjang ini.",
  usage_limit: "Kuota kode promo sudah habis.",
  customer_limit: "Kamu sudah memakai kode promo ini.",
};

function isEligible(line: DiscountLine, e: CouponRule["eligibility"]) {
  const byCategory = e.categoryIds && e.categoryIds.length > 0;
  const byVariant = e.variantIds && e.variantIds.length > 0;
  if (!byCategory && !byVariant) return true;
  return Boolean(
    (byCategory && e.categoryIds!.includes(line.categoryId)) ||
      (byVariant && e.variantIds!.includes(line.variantId)),
  );
}

export function computeDiscount(
  rule: CouponRule,
  lines: DiscountLine[],
  now: Date,
):
  | { ok: true; discountIdr: number; perLine: number[] }
  | { ok: false; reason: CouponRejection } {
  if (!rule.active) return { ok: false, reason: "inactive" };
  if (now < rule.startsAt) return { ok: false, reason: "not_started" };
  if (now >= rule.endsAt) return { ok: false, reason: "ended" };

  const subtotal = lines.reduce((s, l) => s + l.lineSubtotalIdr, 0);
  if (rule.minSubtotalIdr != null && subtotal < rule.minSubtotalIdr) return { ok: false, reason: "min_subtotal" };

  const eligibleMask = lines.map((l) => isEligible(l, rule.eligibility));
  const eligibleSubtotal = lines.reduce((s, l, i) => s + (eligibleMask[i] ? l.lineSubtotalIdr : 0), 0);
  if (eligibleSubtotal <= 0) return { ok: false, reason: "not_eligible" };

  let discount =
    rule.type === "percentage"
      ? Math.floor((eligibleSubtotal * rule.value) / 10_000)
      : Math.min(rule.value, eligibleSubtotal);
  if (rule.maxDiscountIdr != null) discount = Math.min(discount, rule.maxDiscountIdr);
  discount = Math.max(0, Math.min(discount, eligibleSubtotal));

  return {
    ok: true,
    discountIdr: discount,
    perLine: allocate(
      discount,
      lines.map((l, i) => (eligibleMask[i] ? l.lineSubtotalIdr : 0)),
    ),
  };
}

/**
 * Bagi diskon ke baris secara proporsional dengan metode sisa terbesar.
 * Jumlahnya selalu tepat sama dengan total diskon dan tidak ada baris yang melebihi nilainya.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const base = raw.map(Math.floor);
  let remainder = total - base.reduce((s, b) => s + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    const current = base[i] ?? 0;
    if (current < (weights[i] ?? 0)) {
      base[i] = current + 1;
      remainder -= 1;
    }
  }
  return base;
}

import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "@/server/db/types";
import { DomainError } from "@/server/errors";
import { computeDiscount, couponRejectionMessage, type CouponRejection, type DiscountLine } from "./discount";

export class CouponRejectedError extends DomainError {
  constructor(reason: CouponRejection) {
    super("coupon_rejected", couponRejectionMessage[reason], { reason });
    this.name = "CouponRejectedError";
  }
}

/** Order yang "memakai" kuota kupon: semua kecuali yang gagal/kedaluwarsa/batal. */
const CONSUMING_ORDER_STATUSES: Prisma.EnumOrderStatusFilter = {
  notIn: ["expired", "cancelled", "payment_failed"],
};

export function normalizeCouponCode(code: string) {
  return code.trim().toUpperCase();
}

/**
 * Validasi + kunci kupon di dalam transaksi pembuatan order.
 * Baris kupon dikunci FOR UPDATE agar dua checkout paralel tidak melewati batas pemakaian.
 */
export async function applyCouponInTx(
  tx: Tx,
  input: { code: string; lines: DiscountLine[]; userId: string | null; contactPhone: string; now: Date },
) {
  const code = normalizeCouponCode(input.code);
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "app"."Coupon" WHERE "code" = ${code} FOR UPDATE`;
  const id = locked[0]?.id;
  if (!id) throw new CouponRejectedError("inactive");

  const coupon = await tx.coupon.findUniqueOrThrow({ where: { id } });
  const result = computeDiscount(
    {
      type: coupon.type,
      value: coupon.value,
      minSubtotalIdr: coupon.minSubtotalIdr,
      maxDiscountIdr: coupon.maxDiscountIdr,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      active: coupon.active,
      eligibility: (coupon.eligibility ?? {}) as { categoryIds?: string[]; variantIds?: string[] },
    },
    input.lines,
    input.now,
  );
  if (!result.ok) throw new CouponRejectedError(result.reason);

  if (coupon.usageLimit != null) {
    const used = await tx.couponRedemption.count({
      where: { couponId: id, order: { status: CONSUMING_ORDER_STATUSES } },
    });
    if (used >= coupon.usageLimit) throw new CouponRejectedError("usage_limit");
  }
  if (coupon.perCustomerLimit != null) {
    const usedByCustomer = await tx.couponRedemption.count({
      where: {
        couponId: id,
        order: {
          status: CONSUMING_ORDER_STATUSES,
          OR: [
            ...(input.userId ? [{ userId: input.userId }] : []),
            { contact: { path: ["phone"], equals: input.contactPhone } },
          ],
        },
      },
    });
    if (usedByCustomer >= coupon.perCustomerLimit) throw new CouponRejectedError("customer_limit");
  }

  return { couponId: id, code, discountIdr: result.discountIdr, perLine: result.perLine };
}

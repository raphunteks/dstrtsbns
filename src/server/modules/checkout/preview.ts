import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { RajaOngkirClient, ShippingOption } from "@/server/integrations/rajaongkir-cost/client";
import { getCartView } from "@/server/modules/cart/service";
import { computeDiscount, couponRejectionMessage } from "@/server/modules/coupons/discount";
import { normalizeCouponCode } from "@/server/modules/coupons/redeem";
import { packageWeightGrams, quoteShipping } from "@/server/modules/shipping/quotes";
import { CartNotReadyError } from "./place-order";

/**
 * Ringkasan SCR-006 sebelum bayar: layanan kurir + ongkir + diskon + total per opsi (FR-019, FR-020).
 * Total final tetap dihitung ulang dan dibandingkan saat placeOrder.
 * Batas pemakaian kupon baru diperiksa saat order dibuat (butuh kunci baris).
 */
export async function previewCheckout(
  deps: { db: PrismaClient; shippingClient: RajaOngkirClient | null; now?: Date },
  input: { cartId: string; groupKey: string; destinationId: string; couponCode?: string },
) {
  const now = deps.now ?? new Date();
  const view = await getCartView(deps.db, input.cartId);
  const group = view.groups.find((g) => g.key === input.groupKey);
  if (!group || group.lines.length === 0) throw new CartNotReadyError("empty");

  const settings = await deps.db.storeSettings.findUnique({
    where: { id: 1 },
    select: { shippingCouriers: true },
  });
  const weightGrams = packageWeightGrams(group.lines);
  const options: ShippingOption[] = await quoteShipping(
    { db: deps.db, client: deps.shippingClient },
    {
      originId: group.originId,
      destinationId: input.destinationId,
      weightGrams,
      couriers: settings?.shippingCouriers ?? [],
    },
  );

  let discountIdr = 0;
  let couponMessage: string | null = null;
  if (input.couponCode?.trim()) {
    const coupon = await deps.db.coupon.findUnique({ where: { code: normalizeCouponCode(input.couponCode) } });
    if (!coupon) {
      couponMessage = couponRejectionMessage.inactive;
    } else {
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
        group.lines.map((l) => ({ variantId: l.variantId, categoryId: l.categoryId, lineSubtotalIdr: l.lineSubtotalIdr })),
        now,
      );
      if (result.ok) discountIdr = result.discountIdr;
      else couponMessage = couponRejectionMessage[result.reason];
    }
  }

  return {
    group,
    weightGrams,
    itemsSubtotalIdr: group.subtotalIdr,
    discountIdr,
    couponMessage,
    feeIdr: 0,
    options: options.map((o) => ({
      ...o,
      grandTotalIdr: group.subtotalIdr - discountIdr + o.costIdr,
    })),
  };
}

import "server-only";
import { amountLimits, PAKASIR_METHODS, type PakasirMethod } from "@/server/integrations/pakasir/client";
import { clock, PaymentNotAllowedError, type PaymentDeps } from "./types";

/**
 * Mulai (atau lanjutkan) pembayaran sebuah order lewat Pakasir v2 (FR-024, FR-078, FR-079).
 *
 * - Nominal = grandTotalIdr snapshot, integer, tidak dihitung ulang dari browser (BR-032).
 * - Idempoten: attempt pending dengan metode sama dipakai ulang. Pakasir create-transaction juga
 *   "find or create" untuk order_id + body yang sama, sehingga retry setelah gangguan jaringan
 *   tidak membuat tagihan kedua.
 * - Baris attempt dibuat dulu di DB (dengan order terkunci), baru provider dipanggil di luar
 *   transaksi — panggilan jaringan tidak menahan kunci.
 */
export async function startPayment(
  deps: PaymentDeps,
  input: { orderId: string; method: string },
) {
  const { db } = deps;
  if (!deps.pakasir || !deps.config) throw new PaymentNotAllowedError("not_configured");
  const config = deps.config;
  const now = clock(deps);

  if (!(PAKASIR_METHODS as readonly string[]).includes(input.method)) {
    throw new PaymentNotAllowedError("method_disabled");
  }
  const method = input.method as PakasirMethod;
  const settings = await db.storeSettings.findUnique({ where: { id: 1 }, select: { paymentMethods: true } });
  if (!(settings?.paymentMethods ?? ["payment_link"]).includes(method)) {
    throw new PaymentNotAllowedError("method_disabled");
  }

  const attempt = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "app"."Order" WHERE "id" = ${input.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, publicNumber: true, status: true, grandTotalIdr: true, reservationExpiresAt: true },
    });
    if (!order || order.status !== "pending_payment" || order.reservationExpiresAt <= now) {
      throw new PaymentNotAllowedError("order_not_payable");
    }
    const { min, max } = amountLimits(method);
    if (order.grandTotalIdr < min || order.grandTotalIdr > max) {
      throw new PaymentNotAllowedError("amount_out_of_range");
    }

    const existing = await tx.paymentAttempt.findFirst({
      where: {
        orderId: order.id,
        method,
        status: "pending",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { ...existing, publicNumber: order.publicNumber };

    const sequence = (await tx.paymentAttempt.count({ where: { orderId: order.id } })) + 1;
    const created = await tx.paymentAttempt.create({
      data: {
        orderId: order.id,
        projectSlug: config.slug,
        providerOrderId: `${order.publicNumber}-${sequence}`,
        method,
        amountIdr: order.grandTotalIdr,
        isSandbox: config.isSandbox,
        status: "pending",
      },
    });
    return { ...created, publicNumber: order.publicNumber };
  });

  let current = attempt;
  if (!current.txnId) {
    const created = await deps.pakasir.createTransaction({
      providerOrderId: current.providerOrderId,
      method,
      amountIdr: current.amountIdr,
    });
    const updated = await db.paymentAttempt.update({
      where: { id: current.id },
      data: {
        txnId: created.txnId,
        paymentUrl: created.paymentUrl,
        qrString: created.qrString,
        vaNumber: created.vaNumber,
        feeIdr: created.feeIdr,
        totalPaymentIdr: created.totalPaymentIdr,
        expiresAt: created.expiresAt,
      },
    });
    await db.order.updateMany({
      where: { id: current.orderId, status: "pending_payment" },
      data: { paymentStatus: "pending" },
    });
    current = { ...updated, publicNumber: attempt.publicNumber };
  }

  // Redirect dari halaman Pakasir hanya navigasi, BUKAN bukti bayar (BR-033).
  const paymentUrl = current.paymentUrl
    ? `${current.paymentUrl}${current.paymentUrl.includes("?") ? "&" : "?"}redirect=${encodeURIComponent(
        `${config.appUrl}/pesanan/${attempt.publicNumber}`,
      )}`
    : null;

  return {
    attemptId: current.id,
    method,
    amountIdr: current.amountIdr,
    totalPaymentIdr: current.totalPaymentIdr,
    paymentUrl,
    qrString: current.qrString,
    vaNumber: current.vaNumber,
    expiresAt: current.expiresAt,
  };
}

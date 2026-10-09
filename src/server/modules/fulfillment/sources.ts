import "server-only";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { NotFoundError, ValidationError } from "@/server/errors";
import { writeAudit } from "@/server/modules/audit/log";

/**
 * Sumber pemenuhan internal: pemasok & kuota preorder (FR-068, FR-069, FR-073, SCR-022).
 * Pemasok tidak punya akun/portal (BR-030). Data hanya berarti bila mode terkait diaktifkan di
 * pengaturan toko (OD-002) — modul ini tidak mengaktifkan mode apa pun.
 */

const preorderSchema = z
  .object({
    quotaTotal: z.number().int().min(0).max(100_000),
    processingDaysMin: z.number().int().min(0).max(120),
    processingDaysMax: z.number().int().min(0).max(120),
    cutoffAt: z.coerce.date().nullable(),
    policyNote: z.string().trim().min(10, "Tulis aturan batal/refund preorder."),
    active: z.boolean(),
  })
  .refine((p) => p.processingDaysMin <= p.processingDaysMax, {
    message: "Estimasi minimum tidak boleh melebihi maksimum",
    path: ["processingDaysMax"],
  });

export async function upsertPreorderAllocation(
  db: PrismaClient,
  actor: StaffActor,
  variantId: string,
  raw: z.input<typeof preorderSchema>,
) {
  assertCan(actor, "fulfillment.manage");
  const parsed = preorderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const input = parsed.data;
  return db.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: variantId }, select: { fulfillmentMode: true } });
    if (!variant) throw new NotFoundError("ProductVariant");
    if (variant.fulfillmentMode !== "preorder") {
      throw new ValidationError([{ path: "variantId", message: "Varian ini bukan mode preorder." }]);
    }
    const existing = await tx.preorderAllocation.findUnique({ where: { variantId } });
    if (existing && input.quotaTotal < existing.quotaReserved) {
      throw new ValidationError([
        { path: "quotaTotal", message: `Kuota tidak boleh di bawah yang sudah dipesan (${existing.quotaReserved}).` },
      ]);
    }
    const saved = await tx.preorderAllocation.upsert({
      where: { variantId },
      create: { variantId, ...input },
      update: input,
    });
    await writeAudit(tx, {
      actor,
      action: "preorder.upsert",
      targetType: "ProductVariant",
      targetId: variantId,
      before: existing ? { quotaTotal: existing.quotaTotal, active: existing.active } : undefined,
      after: { quotaTotal: input.quotaTotal, active: input.active, processingDays: [input.processingDaysMin, input.processingDaysMax] },
    });
    return saved;
  });
}

const supplierAvailabilitySchema = z.object({
  variantId: z.string().uuid(),
  supplierId: z.string().uuid(),
  committedQty: z.number().int().min(1).max(100_000),
  validUntil: z.coerce.date(),
  sourceReference: z.string().trim().max(200).optional(),
});

/** Catat komitmen ketersediaan dari pemasok — dasar satu-satunya untuk menjual mode pemasok (BR-024, BR-028). */
export async function recordSupplierAvailability(
  db: PrismaClient,
  actor: StaffActor,
  raw: z.input<typeof supplierAvailabilitySchema>,
) {
  assertCan(actor, "fulfillment.manage");
  const input = supplierAvailabilitySchema.parse(raw);
  if (input.validUntil.getTime() <= Date.now()) {
    throw new ValidationError([{ path: "validUntil", message: "Masa berlaku komitmen harus di masa depan." }]);
  }
  return db.$transaction(async (tx) => {
    const [variant, supplier] = await Promise.all([
      tx.productVariant.findUnique({ where: { id: input.variantId }, select: { fulfillmentMode: true } }),
      tx.supplier.findUnique({ where: { id: input.supplierId }, select: { active: true } }),
    ]);
    if (!variant || variant.fulfillmentMode !== "supplier_fulfilled") {
      throw new ValidationError([{ path: "variantId", message: "Varian ini bukan mode pemasok." }]);
    }
    if (!supplier?.active) throw new ValidationError([{ path: "supplierId", message: "Pemasok tidak aktif." }]);
    const row = await tx.supplierAvailability.create({
      data: { ...input, lastCheckedAt: new Date() },
      select: { id: true },
    });
    await tx.supplier.update({ where: { id: input.supplierId }, data: { lastVerifiedAt: new Date() } });
    await writeAudit(tx, {
      actor,
      action: "supplier.availability_recorded",
      targetType: "ProductVariant",
      targetId: input.variantId,
      after: { committedQty: input.committedQty, validUntil: input.validUntil.toISOString(), supplierId: input.supplierId },
    });
    return row;
  });
}

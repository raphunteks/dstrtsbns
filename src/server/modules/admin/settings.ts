import "server-only";
import type { PrismaClient, StaffRoleName } from "@prisma/client";
import { z } from "zod";
import { assertCan, type StaffActor } from "@/server/auth/permissions";
import { DomainError, ValidationError } from "@/server/errors";
import { PAKASIR_METHODS } from "@/server/integrations/pakasir/client";
import { writeAudit } from "@/server/modules/audit/log";
import { featureFlagsSchema } from "@/server/modules/settings/feature-flags";

/** Konfigurasi toko terkontrol + teraudit (FR-061, NFR-014). */
export const storeSettingsInputSchema = z.object({
  supportEmail: z.string().trim().toLowerCase().email().nullable().optional(),
  supportWhatsapp: z
    .string()
    .trim()
    .regex(/^\+62\d{8,13}$/, "Format +62…")
    .nullable()
    .optional(),
  timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]).optional(),
  reservationHoldMinutes: z.number().int().min(10).max(120).optional(),
  shippingCouriers: z
    .array(z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,20}$/))
    .max(10)
    .optional(),
  paymentMethods: z.array(z.enum(PAKASIR_METHODS)).min(1, "Minimal satu metode pembayaran").optional(),
  featureFlags: featureFlagsSchema.optional(),
});

export type StoreSettingsInput = z.input<typeof storeSettingsInputSchema>;

export async function updateStoreSettings(db: PrismaClient, actor: StaffActor, raw: StoreSettingsInput) {
  assertCan(actor, "settings.manage");
  const parsed = storeSettingsInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const input = parsed.data;

  return db.$transaction(async (tx) => {
    const before = await tx.storeSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    const after = await tx.storeSettings.update({
      where: { id: 1 },
      data: {
        ...input,
        shippingCouriers: input.shippingCouriers ? [...new Set(input.shippingCouriers)] : undefined,
        updatedById: actor.userId,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "settings.update",
      targetType: "StoreSettings",
      targetId: "1",
      before: {
        reservationHoldMinutes: before.reservationHoldMinutes,
        shippingCouriers: before.shippingCouriers,
        paymentMethods: before.paymentMethods,
        featureFlags: before.featureFlags as object,
      },
      after: {
        reservationHoldMinutes: after.reservationHoldMinutes,
        shippingCouriers: after.shippingCouriers,
        paymentMethods: after.paymentMethods,
        featureFlags: after.featureFlags as object,
      },
    });
    return after;
  });
}

export class LastSuperAdminError extends DomainError {
  constructor() {
    super("last_super_admin", "Tidak bisa mencabut super admin terakhir.");
    this.name = "LastSuperAdminError";
  }
}

/** Kelola peran staf (FR-059). Hanya super admin; super admin terakhir tidak bisa dicabut. */
export async function setStaffRole(
  db: PrismaClient,
  actor: StaffActor,
  input: { userId: string; role: StaffRoleName; grant: boolean; reason?: string },
) {
  assertCan(actor, "staff.manage");
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!user) throw new ValidationError([{ path: "userId", message: "Pengguna tidak ditemukan." }]);

    if (input.grant) {
      await tx.staffRole.upsert({
        where: { userId_role: { userId: input.userId, role: input.role } },
        create: { userId: input.userId, role: input.role, grantedById: actor.userId },
        update: {},
      });
    } else {
      if (input.role === "super_admin") {
        await tx.$queryRaw`SELECT 1 FROM "app"."StaffRole" WHERE "role" = 'super_admin' FOR UPDATE`;
        const count = await tx.staffRole.count({ where: { role: "super_admin" } });
        if (count <= 1) throw new LastSuperAdminError();
      }
      await tx.staffRole.deleteMany({ where: { userId: input.userId, role: input.role } });
    }
    await writeAudit(tx, {
      actor,
      action: input.grant ? "staff.role_grant" : "staff.role_revoke",
      targetType: "User",
      targetId: input.userId,
      after: { role: input.role },
      reason: input.reason,
    });
  });
}

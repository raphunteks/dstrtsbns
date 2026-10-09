import "server-only";
import type { Prisma } from "@prisma/client";
import type { StaffActor } from "@/server/auth/permissions";
import type { Db } from "@/server/db/types";

export type AuditEntry = {
  actor: StaffActor | null; // null = sistem (job, webhook)
  action: string; // mis. "product.publish", "stock.adjust"
  targetType: string;
  targetId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
};

/**
 * Jejak aksi sensitif (FR-060). Dipanggil di dalam transaksi yang sama dengan perubahannya,
 * sehingga tidak ada perubahan tanpa jejak dan tidak ada jejak tanpa perubahan.
 * Jangan pernah memasukkan secret, token, atau PII lengkap ke before/after (SEC-010).
 */
export async function writeAudit(db: Db, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      actorUserId: entry.actor?.userId ?? null,
      actorRole: entry.actor ? entry.actor.roles.join(",") : "system",
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
    },
  });
}

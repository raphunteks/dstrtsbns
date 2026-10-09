import "server-only";
import type { StaffRoleName } from "@prisma/client";
import { ForbiddenError } from "@/server/errors";

/**
 * Matriks hak akses staf (PRD §11). Least privilege: peran hanya mendapat yang tertulis.
 * Customer/guest tidak pernah memegang permission di sini — akses mereka berbasis kepemilikan.
 */
export const permissionMatrix = {
  "catalog.write": ["admin_catalog", "super_admin"],
  "stock.adjust": ["admin_catalog", "super_admin"],
  "fulfillment.manage": ["admin_catalog", "admin_order", "super_admin"],
  "order.read": ["admin_order", "admin_finance", "super_admin"],
  "order.process": ["admin_order", "super_admin"],
  "refund.request": ["admin_order", "admin_finance", "super_admin"],
  "refund.approve": ["admin_finance", "super_admin"],
  "settlement.reconcile": ["admin_finance"],
  "content.write": ["admin_catalog", "super_admin"],
  "audit.read": ["admin_order", "admin_finance", "super_admin"],
  "staff.manage": ["super_admin"],
  "settings.manage": ["super_admin"],
} as const satisfies Record<string, readonly StaffRoleName[]>;

export type Permission = keyof typeof permissionMatrix;

export type StaffActor = {
  userId: string;
  roles: readonly StaffRoleName[];
};

export function can(actor: StaffActor, permission: Permission): boolean {
  const allowed: readonly StaffRoleName[] = permissionMatrix[permission];
  return actor.roles.some((role) => allowed.includes(role));
}

export function assertCan(actor: StaffActor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}

import "server-only";
import { db } from "@/server/db/client";
import { DomainError } from "@/server/errors";
import { getSupabaseServer } from "@/server/supabase/server";
import { assertCan, type Permission, type StaffActor } from "./permissions";

export class UnauthenticatedError extends DomainError {
  constructor() {
    super("unauthenticated", "Silakan masuk sebagai staf.");
    this.name = "UnauthenticatedError";
  }
}

export class MfaRequiredError extends DomainError {
  constructor() {
    super("mfa_required", "Verifikasi dua langkah wajib untuk akun staf.");
    this.name = "MfaRequiredError";
  }
}

/**
 * Identitas staf untuk SETIAP permintaan admin (SEC-002). Sumber kebenaran:
 *  - sesi Supabase Auth (getUser memvalidasi token ke server Auth, bukan sekadar membaca cookie),
 *  - verifikasi dua langkah aal2 (SEC-001),
 *  - peran dari tabel app.StaffRole + status akun aktif.
 */
export async function getStaffActor(): Promise<StaffActor> {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthenticatedError();

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") throw new MfaRequiredError();

  const account = await db.user.findUnique({
    where: { id: user.id },
    select: { status: true, staffRoles: { select: { role: true } } },
  });
  if (!account || account.status !== "active" || account.staffRoles.length === 0) {
    throw new UnauthenticatedError();
  }
  return { userId: user.id, roles: account.staffRoles.map((r) => r.role) };
}

/** Pintu masuk setiap Server Action / Route admin: staf + izin, dicek di server. */
export async function requireStaff(permission: Permission): Promise<StaffActor> {
  const actor = await getStaffActor();
  assertCan(actor, permission);
  return actor;
}

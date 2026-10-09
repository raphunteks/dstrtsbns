import "server-only";

/**
 * Kesalahan domain: aman ditampilkan ke pengguna (pesan Bahasa Indonesia, tanpa detail internal).
 * Kesalahan lain (bug, DB down) diperlakukan sebagai 500 tanpa membocorkan isi.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(permission: string) {
    super("forbidden", "Kamu tidak punya izin untuk tindakan ini.", { permission });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string) {
    super("not_found", "Data tidak ditemukan.", { entity });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  constructor(issues: { path: string; message: string }[]) {
    super("validation_failed", "Ada data yang belum valid.", { issues });
    this.name = "ValidationError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

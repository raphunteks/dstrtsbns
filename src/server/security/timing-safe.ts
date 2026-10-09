import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Perbandingan rahasia tanpa bocor lewat waktu eksekusi (SEC-011).
 * Di-hash dulu agar panjang input tidak memengaruhi waktu atau melempar error.
 */
export function safeEqual(received: string | null | undefined, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

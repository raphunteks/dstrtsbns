import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // tanpa I, L, O, U — mudah dibaca & didikte

/**
 * Nomor pesanan publik non-sekuensial, mis. "DTS-7K3Q9M2X" (DATA-011).
 * 8 karakter base32 = 40 bit acak: tidak bisa ditebak berurutan, dan nomor saja
 * TIDAK cukup untuk melihat data pribadi (FR-028, BR-016).
 */
export function generatePublicNumber(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += CROCKFORD[bytes[i]! % 32];
  return `DTS-${out}`;
}

/**
 * Token akses pesanan guest: HMAC dari id order. Deterministik, sehingga permintaan ulang yang
 * idempoten bisa mengembalikan link yang sama tanpa menyimpan token mentah. Yang disimpan di DB
 * hanya hash-nya; menghapus hash = mencabut link.
 */
export function guestAccessToken(secret: string, orderId: string): string {
  return createHmac("sha256", secret).update(`order-access:${orderId}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

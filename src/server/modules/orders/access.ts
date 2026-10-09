import "server-only";
import type { Db } from "@/server/db/types";
import { safeEqual } from "@/server/security/timing-safe";
import { guestAccessToken, hashToken } from "./identifiers";

/**
 * Akses pesanan guest lewat link bertoken (FR-028, BR-016, AC-008).
 * Nomor pesanan saja tidak pernah cukup. Token salah / dicabut / milik order lain → null,
 * tanpa membedakan "order tidak ada" dan "token salah" (anti-enumerasi).
 */
export async function findOrderByGuestToken(
  db: Db,
  appSecret: string,
  publicNumber: string,
  token: string,
) {
  const order = await db.order.findUnique({
    where: { publicNumber },
    select: { id: true, guestAccessTokenHash: true },
  });
  const expected = order ? guestAccessToken(appSecret, order.id) : "invalid";
  const tokenMatches = safeEqual(token, expected);
  const notRevoked = Boolean(order?.guestAccessTokenHash) && order?.guestAccessTokenHash === hashToken(token);
  if (!order || !tokenMatches || !notRevoked) return null;
  return order.id;
}

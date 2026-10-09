import "server-only";
import type { PrismaClient } from "@prisma/client";
import { guestAccessToken } from "@/server/modules/orders/identifiers";
import { templates } from "./templates";

/**
 * Pengirim notifikasi yang tidak terikat vendor (§18: penyedia email belum dipilih).
 * Gagal kirim tidak pernah membatalkan order (BR-022); dicoba ulang dengan batas.
 */
export type EmailSender = {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
};

export const MAX_NOTIFICATION_RETRIES = 5;

export async function dispatchNotifications(
  deps: { db: PrismaClient; sender: EmailSender | null; appUrl: string; appSecret: string },
  { limit = 25 } = {},
) {
  const { db, sender } = deps;
  if (!sender) return { processed: 0, remaining: await db.notificationLog.count({ where: { outcome: "queued" } }), skipped: true };

  const settings = await db.storeSettings.findUnique({ where: { id: 1 }, select: { supportEmail: true } });
  const queue = await db.notificationLog.findMany({
    where: { outcome: "queued", channel: "email", retryCount: { lt: MAX_NOTIFICATION_RETRIES } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  for (const n of queue) {
    const render = templates[n.template];
    const order = n.orderId
      ? await db.order.findUnique({
          where: { id: n.orderId },
          select: {
            id: true,
            publicNumber: true,
            contact: true,
            grandTotalIdr: true,
            shipments: { orderBy: { createdAt: "desc" }, take: 1, select: { courierCode: true, waybill: true } },
          },
        })
      : null;
    if (!render || !order) {
      await db.notificationLog.update({ where: { id: n.id }, data: { outcome: "failed", lastError: "template_or_order_missing" } });
      continue;
    }
    const contact = (order.contact ?? {}) as { name?: string; email?: string | null };
    const message = render({
      publicNumber: order.publicNumber,
      customerName: contact.name ?? "Pelanggan",
      grandTotalIdr: order.grandTotalIdr,
      orderUrl: `${deps.appUrl}/pesanan/${order.publicNumber}?t=${guestAccessToken(deps.appSecret, order.id)}`,
      courier: order.shipments[0]?.courierCode,
      waybill: order.shipments[0]?.waybill,
    });
    const to = message.audience === "staff" ? settings?.supportEmail : contact.email;
    if (!to) {
      // Pembeli tanpa email: halaman pesanan tetap sumber informasi (NOTIF-001).
      await db.notificationLog.update({ where: { id: n.id }, data: { outcome: "failed", lastError: "no_recipient" } });
      continue;
    }
    try {
      await sender.send({ to, subject: message.subject, text: message.text });
      await db.notificationLog.update({ where: { id: n.id }, data: { outcome: "sent", sentAt: new Date() } });
      processed += 1;
    } catch (error) {
      const retryCount = n.retryCount + 1;
      await db.notificationLog.update({
        where: { id: n.id },
        data: {
          retryCount,
          outcome: retryCount >= MAX_NOTIFICATION_RETRIES ? "failed" : "queued",
          lastError: error instanceof Error ? error.message.slice(0, 200) : "send_failed",
        },
      });
    }
  }
  const remaining = await db.notificationLog.count({ where: { outcome: "queued" } });
  return { processed, remaining, skipped: false };
}

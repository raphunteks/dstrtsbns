/**
 * Label status sederhana untuk pembeli (PRD §9.2, DESIGN.md §9.5).
 * Nilai enum harus sama dengan `OrderStatus` di prisma/schema.prisma.
 * Admin melihat status domain rinci, bukan label ini.
 */
export type OrderStatusValue =
  | "pending_payment"
  | "paid"
  | "processing"
  | "packed"
  | "shipped"
  | "delivered"
  | "completed"
  | "payment_failed"
  | "expired"
  | "cancelled"
  | "payment_exception"
  | "return_requested"
  | "returned"
  | "refund_pending"
  | "partially_refunded"
  | "refunded";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const customerOrderStatus: Record<OrderStatusValue, { label: string; tone: StatusTone }> = {
  pending_payment: { label: "Menunggu pembayaran", tone: "warning" },
  paid: { label: "Pembayaran terkonfirmasi", tone: "success" },
  processing: { label: "Sedang disiapkan", tone: "info" },
  packed: { label: "Sedang disiapkan", tone: "info" },
  shipped: { label: "Dikirim", tone: "info" },
  delivered: { label: "Diterima", tone: "success" },
  completed: { label: "Selesai", tone: "success" },
  payment_failed: { label: "Pembayaran gagal", tone: "danger" },
  expired: { label: "Kedaluwarsa", tone: "neutral" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
  payment_exception: { label: "Sedang ditinjau tim kami", tone: "warning" },
  return_requested: { label: "Pengajuan retur diproses", tone: "info" },
  returned: { label: "Retur diterima", tone: "info" },
  refund_pending: { label: "Pengembalian dana diproses", tone: "info" },
  partially_refunded: { label: "Dana dikembalikan sebagian", tone: "info" },
  refunded: { label: "Dana dikembalikan", tone: "success" },
};

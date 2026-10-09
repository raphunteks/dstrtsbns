import { formatRupiah } from "@/lib/money";

/**
 * Isi notifikasi (§15). Bahasa Indonesia, faktual, tanpa janji yang tidak bisa dibuktikan.
 * Halaman status pesanan tetap sumber kebenaran — email hanya pemberitahuan.
 */
export type TemplateContext = {
  publicNumber: string;
  customerName: string;
  grandTotalIdr: number;
  orderUrl: string | null;
  courier?: string | null;
  waybill?: string | null;
};

export type RenderedMessage = { subject: string; text: string; audience: "customer" | "staff" };

export const templates: Record<string, (c: TemplateContext) => RenderedMessage> = {
  order_paid: (c) => ({
    audience: "customer",
    subject: `Pembayaran pesanan ${c.publicNumber} terkonfirmasi`,
    text: [
      `Halo ${c.customerName},`,
      ``,
      `Pembayaran ${formatRupiah(c.grandTotalIdr)} untuk pesanan ${c.publicNumber} sudah terkonfirmasi.`,
      `Kami mulai menyiapkan pesananmu.`,
      c.orderUrl ? `\nLihat status pesanan: ${c.orderUrl}` : ``,
      ``,
      `Daster Tasbon Olshop`,
    ].join("\n"),
  }),
  order_shipped: (c) => ({
    audience: "customer",
    subject: `Pesanan ${c.publicNumber} sudah dikirim`,
    text: [
      `Halo ${c.customerName},`,
      ``,
      `Pesanan ${c.publicNumber} sudah diserahkan ke kurir ${c.courier?.toUpperCase() ?? ""}.`,
      `Nomor resi: ${c.waybill ?? "-"}`,
      `Estimasi kurir bukan jaminan waktu tiba.`,
      c.orderUrl ? `\nLacak pesanan: ${c.orderUrl}` : ``,
      ``,
      `Daster Tasbon Olshop`,
    ].join("\n"),
  }),
  order_cancelled: (c) => ({
    audience: "customer",
    subject: `Pesanan ${c.publicNumber} dibatalkan`,
    text: [
      `Halo ${c.customerName},`,
      ``,
      `Pesanan ${c.publicNumber} dibatalkan. Bila sudah membayar, tim kami memproses pengembalian dana dan akan mengabari setelah dana dikirim.`,
      ``,
      `Daster Tasbon Olshop`,
    ].join("\n"),
  }),
  refund_succeeded: (c) => ({
    audience: "customer",
    subject: `Pengembalian dana pesanan ${c.publicNumber}`,
    text: [
      `Halo ${c.customerName},`,
      ``,
      `Pengembalian dana untuk pesanan ${c.publicNumber} sudah kami kirim.`,
      `Bila belum masuk dalam beberapa hari kerja, balas email ini dengan menyertakan nomor pesanan.`,
      ``,
      `Daster Tasbon Olshop`,
    ].join("\n"),
  }),
  fulfillment_exception: (c) => ({
    audience: "customer",
    subject: `Kendala menyiapkan pesanan ${c.publicNumber}`,
    text: [
      `Halo ${c.customerName},`,
      ``,
      `Ada kendala dalam menyiapkan pesanan ${c.publicNumber}. Tim kami akan menghubungimu untuk pilihan solusi, termasuk pengembalian dana.`,
      ``,
      `Daster Tasbon Olshop`,
    ].join("\n"),
  }),
  staff_order_ready: (c) => ({
    audience: "staff",
    subject: `[Pesanan baru lunas] ${c.publicNumber}`,
    text: `Pesanan ${c.publicNumber} (${formatRupiah(c.grandTotalIdr)}) sudah lunas dan menunggu diproses.`,
  }),
  finance_payment_exception: (c) => ({
    audience: "staff",
    subject: `[Perlu tindakan] Pembayaran terlambat ${c.publicNumber}`,
    text: `Dana ${formatRupiah(c.grandTotalIdr)} untuk ${c.publicNumber} masuk setelah reservasi stok dilepas. Putuskan: proses (bila stok ada) atau refund.`,
  }),
};

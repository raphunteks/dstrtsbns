import "server-only";

/**
 * Daftar job yang boleh dipanggil pg_cron lewat /api/jobs/<nama>.
 * Setiap handler memproses SATU batch kecil lalu melaporkan sisa pekerjaan,
 * supaya aman terhadap batas durasi fungsi Vercel maupun proses di VPS.
 */
export type JobResult = {
  processed: number;
  remaining: number;
  status: "ok" | "not_implemented";
  note?: string;
};

type JobHandler = () => Promise<JobResult>;

const notYet =
  (phase: string): JobHandler =>
  async () => ({
    processed: 0,
    remaining: 0,
    status: "not_implemented",
    note: `Diimplementasikan di ${phase}`,
  });

export const jobs = {
  "expire-reservations": notYet("Fase 2 (inventori)"),
  "process-webhook-inbox": notYet("Fase 4 (pembayaran)"),
  "reconcile-pakasir": notYet("Fase 4 (pembayaran)"),
  "send-notifications": notYet("Fase 5 (admin & notifikasi)"),
  "sync-waybill": notYet("Fase 5 (fulfillment)"),
  "expire-supplier-availability": notYet("Fase 2 (inventori)"),
  "daily-reconciliation": notYet("Fase 5 (keuangan)"),
} satisfies Record<string, JobHandler>;

export type JobName = keyof typeof jobs;

export function isJobName(name: string): name is JobName {
  return Object.prototype.hasOwnProperty.call(jobs, name);
}

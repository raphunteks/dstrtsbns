import "server-only";
import { runExpireReservations, runExpireSupplierAvailability } from "./inventory-jobs";
import { runDailyReconciliation, runSendNotifications, runSyncWaybill } from "./operations-jobs";
import { runProcessWebhookInbox, runReconcilePakasir } from "./payment-jobs";

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

export const jobs = {
  "expire-reservations": runExpireReservations,
  "process-webhook-inbox": runProcessWebhookInbox,
  "reconcile-pakasir": runReconcilePakasir,
  "send-notifications": runSendNotifications,
  "sync-waybill": runSyncWaybill,
  "expire-supplier-availability": runExpireSupplierAvailability,
  "daily-reconciliation": runDailyReconciliation,
} satisfies Record<string, JobHandler>;

export type JobName = keyof typeof jobs;

export function isJobName(name: string): name is JobName {
  return Object.prototype.hasOwnProperty.call(jobs, name);
}

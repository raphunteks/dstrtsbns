import "server-only";
import { getPaymentDeps } from "@/server/modules/payments/deps";
import { processPendingInbox, reconcilePakasir } from "@/server/modules/payments/reconcile";
import type { JobResult } from "./registry";

const notConfigured: JobResult = {
  processed: 0,
  remaining: 0,
  status: "ok",
  note: "Pakasir belum dikonfigurasi (OD-014)",
};

export async function runProcessWebhookInbox(): Promise<JobResult> {
  const deps = getPaymentDeps();
  if (!deps.pakasir) return notConfigured;
  const { processed, remaining } = await processPendingInbox(deps);
  return { processed, remaining, status: "ok" };
}

export async function runReconcilePakasir(): Promise<JobResult> {
  const deps = getPaymentDeps();
  if (!deps.pakasir) return notConfigured;
  const { processed, remaining } = await reconcilePakasir(deps);
  return { processed, remaining, status: "ok" };
}

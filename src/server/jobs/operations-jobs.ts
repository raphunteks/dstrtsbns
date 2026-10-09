import "server-only";
import { db } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { dailyReconciliation } from "@/server/modules/finance/daily-reconciliation";
import { dispatchNotifications } from "@/server/modules/notifications/dispatch";
import { getRajaOngkirClient } from "@/server/modules/shipping/provider";
import { syncWaybills } from "@/server/modules/shipping/tracking";
import type { JobResult } from "./registry";

export async function runSendNotifications(): Promise<JobResult> {
  const env = getEnv();
  // Penyedia email belum dipilih owner (§18). Antrean tetap tersimpan dan dikirim setelah dikonfigurasi.
  const result = await dispatchNotifications({ db, sender: null, appUrl: env.APP_URL, appSecret: env.APP_SECRET });
  return {
    processed: result.processed,
    remaining: result.remaining,
    status: "ok",
    note: result.skipped ? "Penyedia email belum dikonfigurasi — notifikasi tetap antre" : undefined,
  };
}

export async function runDailyReconciliation(): Promise<JobResult> {
  const { total } = await dailyReconciliation(db);
  return { processed: 1, remaining: 0, status: "ok", note: total > 0 ? `${total} temuan rekonsiliasi` : undefined };
}

export async function runSyncWaybill(): Promise<JobResult> {
  const { processed, remaining } = await syncWaybills({ db, client: getRajaOngkirClient() });
  return { processed, remaining, status: "ok" };
}

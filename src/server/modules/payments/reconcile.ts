import "server-only";
import { ProviderError } from "@/server/integrations/http";
import { applyVerifiedCompletion, type CompletionOutcome } from "./apply-completion";
import { processInboxItem } from "./webhook";
import { clock, completionFingerprint, type PaymentDeps } from "./types";

/** Pakasir: cek status per transaksi paling cepat sekali tiap 4 detik (FR-081, NFR-019). */
export const STATUS_MIN_INTERVAL_MS = 4_000;

/**
 * Cek status resmi satu attempt dan terapkan bila lunas. Menghormati jeda 4 detik:
 * bila baru saja dicek, tidak memanggil provider dan mengembalikan "throttled".
 */
export async function verifyAttemptStatus(
  deps: PaymentDeps,
  attemptId: string,
): Promise<CompletionOutcome | "pending" | "canceled" | "throttled" | "skipped"> {
  const { db } = deps;
  const now = clock(deps);
  if (!deps.pakasir) return "skipped";

  // Klaim slot cek secara atomik agar dua permintaan bersamaan tidak sama-sama memanggil provider.
  const claimed = await db.$executeRaw`
    UPDATE "app"."PaymentAttempt" SET "verifiedStatusAt" = ${now}
     WHERE "id" = ${attemptId}::uuid AND "status" = 'pending' AND "txnId" IS NOT NULL
       AND ("verifiedStatusAt" IS NULL OR "verifiedStatusAt" <= ${new Date(now.getTime() - STATUS_MIN_INTERVAL_MS)})`;
  if (claimed !== 1) return "throttled";

  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const status = await deps.pakasir.getStatus(attempt.txnId!);

  if (status.order_id !== attempt.providerOrderId || status.amount !== attempt.amountIdr) {
    console.error(`[pakasir-reconcile] status tidak cocok untuk attempt ${attempt.id}`);
    return "skipped";
  }
  if (status.status === "pending") return "pending";
  if (status.status === "canceled") {
    await db.paymentAttempt.updateMany({ where: { id: attempt.id, status: "pending" }, data: { status: "canceled" } });
    return "canceled";
  }
  return applyVerifiedCompletion(db, {
    attemptId: attempt.id,
    fingerprint: completionFingerprint(status),
    completedAt: status.completed_at ? new Date(status.completed_at) : now,
    payload: status,
    now,
  });
}

/**
 * Job reconcile-pakasir (FR-081, RISK-003):
 *  a) attempt pending yang sudah berumur → cek status resmi (menangkap webhook yang hilang),
 *  b) attempt pending milik order yang sudah kedaluwarsa/batal → batalkan di Pakasir (FR-082).
 * Batch kecil agar aman terhadap batas durasi fungsi.
 */
export async function reconcilePakasir(deps: PaymentDeps, { limit = 15 } = {}) {
  const { db } = deps;
  const now = clock(deps);
  if (!deps.pakasir) return { processed: 0, remaining: 0 };

  const stale = new Date(now.getTime() - 60_000);
  const candidates = await db.paymentAttempt.findMany({
    where: {
      status: "pending",
      txnId: { not: null },
      createdAt: { lte: stale },
      order: { status: "pending_payment" },
      OR: [{ verifiedStatusAt: null }, { verifiedStatusAt: { lte: stale } }],
    },
    orderBy: [{ verifiedStatusAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    take: limit,
    select: { id: true },
  });

  let processed = 0;
  for (const c of candidates) {
    try {
      await verifyAttemptStatus(deps, c.id);
      processed += 1;
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "auth") throw error;
      console.error("[pakasir-reconcile] gagal cek attempt", c.id);
    }
  }

  // Order sudah tidak menunggu bayar tetapi attempt masih terbuka → batalkan agar pembeli tidak membayar.
  const orphaned = await db.paymentAttempt.findMany({
    where: { status: "pending", txnId: { not: null }, order: { status: { in: ["expired", "cancelled"] } } },
    take: limit,
    select: { id: true, txnId: true },
  });
  for (const a of orphaned) {
    try {
      await deps.pakasir.cancel(a.txnId!);
      await db.paymentAttempt.updateMany({ where: { id: a.id, status: "pending" }, data: { status: "canceled" } });
      processed += 1;
    } catch {
      // Bisa jadi sudah dibayar di detik terakhir → cek status pada putaran berikutnya (jadi payment_exception).
      await verifyAttemptStatus(deps, a.id).catch(() => undefined);
    }
  }

  const remaining = await db.paymentAttempt.count({
    where: { status: "pending", txnId: { not: null }, order: { status: { in: ["expired", "cancelled"] } } },
  });
  return { processed, remaining };
}

/** Job process-webhook-inbox: ulangi webhook terverifikasi yang belum selesai diproses. */
export async function processPendingInbox(deps: PaymentDeps, { limit = 20, maxAttempts = 10 } = {}) {
  const { db } = deps;
  const rows = await db.providerWebhookInbox.findMany({
    where: { provider: "pakasir", verified: true, processedAt: null, attempts: { lt: maxAttempts } },
    orderBy: { receivedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let processed = 0;
  for (const row of rows) {
    try {
      await processInboxItem(deps, row.id);
      processed += 1;
    } catch (error) {
      await db.providerWebhookInbox.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 300) : "unknown" },
      });
    }
  }
  const remaining = await db.providerWebhookInbox.count({
    where: { provider: "pakasir", verified: true, processedAt: null, attempts: { lt: maxAttempts } },
  });
  return { processed, remaining };
}

import "server-only";
import { createHash } from "node:crypto";
import { pakasirWebhookSchema, type PakasirStatus } from "@/server/integrations/pakasir/client";
import { safeEqual } from "@/server/security/timing-safe";
import { writeAudit } from "@/server/modules/audit/log";
import { applyVerifiedCompletion, type CompletionOutcome } from "./apply-completion";
import { clock, completionFingerprint, type PaymentDeps } from "./types";

/**
 * Webhook Pakasir v2 (FR-025, FR-080, BR-009, BR-010, BR-034).
 *
 * 1. X-Secret dibandingkan waktu-konstan. Salah → 401, dicatat, tidak ada perubahan.
 * 2. Payload disimpan ke inbox dengan fingerprint unik (dedup + bisa diproses ulang oleh job).
 * 3. Diproses langsung: cocokkan order_id/txn_id/amount/sandbox dengan attempt, lalu konfirmasi ke
 *    GET transaction-status resmi sebelum menandai lunas. Secret yang bocor saja tidak cukup
 *    untuk memalsukan pelunasan.
 * 4. Selalu 200 setelah tersimpan, walau pemrosesan gagal — job `process-webhook-inbox` mengulang.
 */
export async function receivePakasirWebhook(
  deps: PaymentDeps,
  input: { secretHeader: string | null; rawBody: string },
): Promise<{ httpStatus: 200 | 400 | 401 | 503; outcome?: string }> {
  const { db } = deps;
  if (!deps.config) return { httpStatus: 503 };

  const rawFingerprint = createHash("sha256").update(input.rawBody).digest("hex");

  if (!safeEqual(input.secretHeader, deps.config.webhookSecret)) {
    await db.$executeRaw`
      INSERT INTO "app"."ProviderWebhookInbox" ("id", "provider", "fingerprint", "verified", "payloadRedacted", "lastError")
      VALUES (gen_random_uuid(), 'pakasir', ${`invalid-secret:${rawFingerprint}`}, false, '{}'::jsonb, 'invalid_secret')
      ON CONFLICT ("provider", "fingerprint") DO NOTHING`;
    console.warn("[pakasir-webhook] X-Secret tidak cocok — ditolak");
    return { httpStatus: 401 };
  }

  let payload: PakasirStatus;
  try {
    const parsed = pakasirWebhookSchema.safeParse(JSON.parse(input.rawBody));
    if (!parsed.success) return { httpStatus: 400 };
    payload = parsed.data;
  } catch {
    return { httpStatus: 400 };
  }

  // Sidik jari inbox = isi payload lengkap. Payload yang berbeda sedikit saja (mis. is_sandbox
  // dipalsukan) tidak boleh "menghabiskan" slot milik webhook asli.
  const fingerprint = `pakasir:inbox:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "app"."ProviderWebhookInbox" ("id", "provider", "fingerprint", "externalEventId", "verified", "payloadRedacted")
    VALUES (gen_random_uuid(), 'pakasir', ${fingerprint}, ${payload.txn_id}, true, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT ("provider", "fingerprint") DO UPDATE SET "verified" = true
    RETURNING "id"`;
  const inboxId = rows[0]!.id;

  try {
    const outcome = await processInboxItem(deps, inboxId);
    return { httpStatus: 200, outcome };
  } catch (error) {
    await db.providerWebhookInbox.update({
      where: { id: inboxId },
      data: { attempts: { increment: 1 }, lastError: error instanceof Error ? error.message.slice(0, 300) : "unknown" },
    });
    console.error("[pakasir-webhook] pemrosesan ditunda ke job:", error instanceof Error ? error.message : error);
    return { httpStatus: 200, outcome: "queued" };
  }
}

export type InboxOutcome = CompletionOutcome | "ignored_status" | "mismatch" | "unknown_attempt" | "already_processed" | "not_confirmed";

/** Proses satu baris inbox. Melempar error bila konfirmasi status resmi gagal (akan diulang). */
export async function processInboxItem(deps: PaymentDeps, inboxId: string): Promise<InboxOutcome> {
  const { db } = deps;
  const now = clock(deps);
  const item = await db.providerWebhookInbox.findUniqueOrThrow({ where: { id: inboxId } });
  if (item.processedAt) return "already_processed";

  const finish = async (lastError: string | null) => {
    await db.providerWebhookInbox.update({
      where: { id: inboxId },
      data: { processedAt: now, lastError, attempts: { increment: 1 } },
    });
  };

  const payload = pakasirWebhookSchema.parse(item.payloadRedacted);
  if (payload.status !== "completed") {
    await finish(null);
    return "ignored_status";
  }

  const attempt = await db.paymentAttempt.findUnique({ where: { providerOrderId: payload.order_id } });
  const mismatch =
    !attempt
      ? "unknown_attempt"
      : (attempt.txnId && attempt.txnId !== payload.txn_id) ||
          attempt.amountIdr !== payload.amount ||
          attempt.isSandbox !== payload.is_sandbox ||
          (deps.config && attempt.isSandbox !== deps.config.isSandbox)
        ? "mismatch"
        : null;

  if (mismatch) {
    await db.paymentEvent.create({
      data: {
        paymentAttemptId: attempt?.id ?? null,
        fingerprint: `${completionFingerprint(payload)}:rejected`,
        eventType: "completed",
        validation: "mismatch",
        payloadRedacted: payload,
        processedAt: now,
      },
    }).catch(() => undefined); // event penolakan ganda tidak perlu dicatat dua kali
    await writeAudit(db, {
      actor: null,
      action: "payment.webhook_rejected",
      targetType: "PaymentAttempt",
      targetId: attempt?.id ?? payload.order_id,
      after: { reason: mismatch, txn_id: payload.txn_id, amount: payload.amount, is_sandbox: payload.is_sandbox },
    });
    await finish(mismatch);
    return mismatch === "unknown_attempt" ? "unknown_attempt" : "mismatch";
  }

  // Konfirmasi ke sumber resmi (GET transaction-status) sebelum menandai lunas.
  if (!deps.pakasir) throw new Error("Pakasir belum dikonfigurasi — tidak bisa konfirmasi status");
  const official = await deps.pakasir.getStatus(payload.txn_id);
  await db.paymentAttempt.update({
    where: { id: attempt!.id },
    data: { verifiedStatusAt: now, txnId: attempt!.txnId ?? payload.txn_id },
  });
  if (
    official.status !== "completed" ||
    official.amount !== attempt!.amountIdr ||
    official.order_id !== attempt!.providerOrderId
  ) {
    // Jangan tandai selesai: bila pembayaran memang baru masuk, job/webhook berikutnya
    // akan mengonfirmasi. Payload palsu akan berhenti dicoba setelah batas percobaan.
    await db.providerWebhookInbox.update({
      where: { id: inboxId },
      data: { attempts: { increment: 1 }, lastError: "not_confirmed_by_status_api" },
    });
    return "not_confirmed";
  }

  const outcome = await applyVerifiedCompletion(db, {
    attemptId: attempt!.id,
    fingerprint: completionFingerprint(payload),
    completedAt: official.completed_at ? new Date(official.completed_at) : now,
    payload,
    now,
  });
  await finish(null);
  return outcome;
}

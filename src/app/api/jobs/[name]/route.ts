import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/server/env";
import { isJobName, jobs } from "@/server/jobs/registry";
import { safeEqual } from "@/server/security/timing-safe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Dipanggil oleh pg_cron (supabase/migrations/…_cron_jobs.sql) dengan header x-cron-secret.
 * Sama persis di Vercel dan VPS.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const env = getEnv();

  if (!safeEqual(request.headers.get("x-cron-secret"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  if (!isJobName(name)) {
    return NextResponse.json({ error: "unknown_job" }, { status: 404 });
  }

  const startedAt = Date.now();
  try {
    const result = await jobs[name]();
    return NextResponse.json(
      { job: name, durationMs: Date.now() - startedAt, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Log tanpa payload/secret (FR-090).
    console.error(`[job:${name}] gagal`, error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ job: name, error: "job_failed" }, { status: 500 });
  }
}

"use client";

import { useEffect, useState } from "react";
import { AlertIcon, CheckIcon, ClockIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/money";

const methodLabel: Record<string, string> = {
  payment_link: "Pilih metode di halaman Pakasir (QRIS / VA)",
  bri_va: "Virtual Account BRI",
  bni_va: "Virtual Account BNI",
  cimb_niaga_va: "Virtual Account CIMB Niaga",
  permata_va: "Virtual Account Permata",
  maybank_va: "Virtual Account Maybank",
  bnc_va: "Virtual Account BNC",
  artha_graha_va: "Virtual Account Artha Graha",
  sampoerna_va: "Virtual Account Sampoerna",
};

type Status = {
  status: string;
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  grandTotalIdr: number;
  payableUntil: string | null;
  pendingPayment: { method: string; paymentUrl: string | null; vaNumber: string | null; expiresAt: string | null } | null;
};

const toneClass: Record<Status["tone"], string> = {
  neutral: "text-muted",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function remaining(until: string | null, now: number | null) {
  if (!until || now === null) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "0:00";
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * SCR-007: tombol bayar + status. Status hanya dari server; kembali dari Pakasir tidak dianggap lunas (BR-033).
 * Polling tiap 5 detik selama menunggu (server membatasi cek ke Pakasir ≤ 1×/4 detik).
 */
export function PaymentPanel({
  publicNumber,
  token,
  methods,
  initial,
}: {
  publicNumber: string;
  token: string;
  methods: string[];
  initial: Status;
}) {
  const [status, setStatus] = useState(initial);
  const [method, setMethod] = useState(methods[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null); // diisi setelah mount → tidak ada mismatch hidrasi
  const waiting = status.status === "pending_payment";

  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/pesanan/${publicNumber}/status?t=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (res.ok) setStatus((await res.json()) as Status);
      } catch {
        /* jaringan putus: coba lagi di putaran berikutnya */
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [waiting, publicNumber, token]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pesanan/${publicNumber}/bayar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, method }),
      });
      const body = (await res.json()) as { error?: string; paymentUrl?: string | null; vaNumber?: string | null; expiresAt?: string | null };
      if (!res.ok) {
        setError(body.error ?? "Pembayaran belum bisa dimulai.");
        return;
      }
      if (body.paymentUrl) {
        window.location.assign(body.paymentUrl);
        return;
      }
      setStatus((s) => ({
        ...s,
        pendingPayment: { method, paymentUrl: null, vaNumber: body.vaNumber ?? null, expiresAt: body.expiresAt ?? null },
      }));
    } catch {
      setError("Koneksi terputus. Coba lagi — tagihan tidak akan dobel.");
    } finally {
      setBusy(false);
    }
  }

  const left = remaining(status.payableUntil, now);
  const pending = status.pendingPayment;

  return (
    <section aria-labelledby="judul-bayar" className="rounded-card border border-rule bg-surface p-4">
      <h2 id="judul-bayar" className="sr-only">Pembayaran</h2>
      <p role="status" aria-live="polite" className={cn("inline-flex items-center gap-2 text-h3 font-semibold", toneClass[status.tone])}>
        {status.tone === "success" ? <CheckIcon className="size-5" /> : status.tone === "danger" ? <AlertIcon className="size-5" /> : <ClockIcon className="size-5" />}
        {status.label}
      </p>
      <p className="mt-2 text-body text-ink">
        Total bayar <strong className="text-h3">{formatRupiah(status.grandTotalIdr)}</strong>
      </p>

      {waiting ? (
        <>
          {left ? (
            <p className="mt-1 text-small text-ink">
              Bayar sebelum stok dilepas: <strong aria-live="off">{left}</strong>
            </p>
          ) : null}

          {pending?.vaNumber ? (
            <div className="mt-4 rounded-input bg-paper-2 p-3">
              <p className="text-small text-muted">{methodLabel[pending.method] ?? pending.method}</p>
              <p className="mt-1 font-mono text-h3 font-bold tracking-wider text-ink">{pending.vaNumber}</p>
              <button type="button" onClick={() => navigator.clipboard?.writeText(pending.vaNumber ?? "")} className="mt-2 min-h-[var(--touch-target)] text-small font-semibold text-accent underline">
                Salin nomor VA
              </button>
            </div>
          ) : null}

          {methods.length === 0 ? (
            <p className="mt-4 text-small font-semibold text-danger">Metode pembayaran belum diaktifkan toko. Hubungi admin.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {methods.length > 1 ? (
                <fieldset>
                  <legend className="text-small font-semibold text-ink">Metode pembayaran</legend>
                  <div className="mt-2 flex flex-col gap-2">
                    {methods.map((m) => (
                      <label key={m} className={cn("flex min-h-[var(--touch-target)] items-center gap-3 rounded-input border px-3", method === m ? "border-accent bg-accent-subtle" : "border-rule-strong")}>
                        <input type="radio" name="metode" checked={method === m} onChange={() => setMethod(m)} className="size-5 accent-accent" />
                        <span className="text-body text-ink">{methodLabel[m] ?? m}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <button
                type="button"
                onClick={pay}
                disabled={busy || !method}
                className="min-h-[var(--touch-target)] w-full rounded-pill bg-accent px-6 text-button font-semibold text-ink-inverse shadow-low hover:bg-accent-hover disabled:opacity-60"
              >
                {busy ? "Menyiapkan pembayaran…" : pending ? "Lanjutkan pembayaran" : "Bayar sekarang"}
              </button>
              <p className="text-small text-muted">
                Setelah membayar, halaman ini diperbarui otomatis begitu pembayaran dikonfirmasi sistem.
              </p>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-3 inline-flex items-start gap-2 text-small font-semibold text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

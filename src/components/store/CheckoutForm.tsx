"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { placeOrderAction, previewAction, type PreviewResult, type QuoteOption } from "@/app/(store)/checkout/actions";
import { AlertIcon, CheckIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/money";

type Destination = {
  id: string;
  label: string;
  provinceName: string | null;
  cityName: string | null;
  districtName: string | null;
  subdistrictName: string | null;
  zipCode: string | null;
};

const field = "min-h-[var(--touch-target)] w-full rounded-input border border-rule-strong bg-surface px-3 text-body text-ink";
const labelCls = "text-small font-semibold text-ink";

function optionKey(o: { courierCode: string; serviceCode: string }) {
  return `${o.courierCode}:${o.serviceCode}`;
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {hint && !error ? <p className="text-caption text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${id}-err`} className="inline-flex items-center gap-1 text-small font-semibold text-danger">
          <AlertIcon className="size-4" /> {error}
        </p>
      ) : null}
    </div>
  );
}

/** SCR-005/006: data pembeli, alamat, ongkir, ringkasan, buat pesanan. */
export function CheckoutForm({ groupKey, subtotalIdr }: { groupKey: string; subtotalIdr: number }) {
  const uid = useId();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [contact, setContact] = useState({ name: "", email: "", phone: "", marketingOptIn: false });
  const [address, setAddress] = useState({ recipientName: "", phone: "", street: "", landmark: "", postalCode: "" });
  const [sameAsContact, setSameAsContact] = useState(true);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [quoting, startQuote] = useTransition();
  const [placing, startPlace] = useTransition();

  // Cari wilayah lewat proxy server (key RajaOngkir tidak sampai ke browser).
  useEffect(() => {
    if (destination || query.trim().length < 3) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/wilayah?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const body = (await res.json()) as { items?: Destination[]; error?: string };
        setSearchError(res.ok ? null : (body.error ?? "Pencarian wilayah bermasalah."));
        setResults(body.items ?? []);
      } catch {
        if (!controller.signal.aborted) setSearchError("Pencarian wilayah bermasalah.");
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, destination]);

  function resetQuote() {
    setPreview(null);
    setSelected(null);
  }

  function quote() {
    if (!destination) {
      setErrors((e) => ({ ...e, "address.destinationId": "Pilih kecamatan/kelurahan dari daftar" }));
      return;
    }
    setMessage(null);
    startQuote(async () => {
      const result = await previewAction({ groupKey, destinationId: destination.id, couponCode: coupon || undefined });
      setPreview(result);
      setSelected(result.ok && result.options[0] ? optionKey(result.options[0]) : null);
    });
  }

  const chosen: QuoteOption | undefined =
    preview?.ok ? preview.options.find((o) => optionKey(o) === selected) : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!destination || !chosen) {
      setMessage("Hitung ongkir dan pilih layanan kirim dulu.");
      return;
    }
    setMessage(null);
    setErrors({});
    const recipientName = sameAsContact ? contact.name : address.recipientName;
    const recipientPhone = sameAsContact ? contact.phone : address.phone;
    startPlace(async () => {
      const result = await placeOrderAction({
        groupKey,
        contact,
        address: {
          recipientName,
          phone: recipientPhone,
          provinceName: destination.provinceName ?? "",
          cityName: destination.cityName ?? "",
          districtName: destination.districtName ?? "",
          subdistrictName: destination.subdistrictName ?? undefined,
          postalCode: address.postalCode || destination.zipCode || "",
          street: address.street,
          landmark: address.landmark || undefined,
          destinationId: destination.id,
          destinationLabel: destination.label,
        },
        shipping: { courierCode: chosen.courierCode, serviceCode: chosen.serviceCode },
        couponCode: coupon || undefined,
        expectedTotalIdr: chosen.grandTotalIdr,
        idempotencyKey,
      });
      if (result.ok) {
        window.location.assign(result.url);
        return;
      }
      setMessage(result.message);
      if (result.issues) setErrors(Object.fromEntries(result.issues.map((i) => [i.path, i.message])));
      if (result.totalChanged) quote();
    });
  }

  const id = (name: string) => `${uid}-${name}`;
  const err = (path: string) => errors[path];

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <fieldset className="flex flex-col gap-4">
        <legend className="text-h3 font-semibold text-ink">1. Data pembeli</legend>
        <Field id={id("name")} label="Nama lengkap" error={err("contact.name")}>
          <input id={id("name")} autoComplete="name" required value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={field} />
        </Field>
        <Field id={id("phone")} label="Nomor WhatsApp/ponsel" error={err("contact.phone")} hint="Untuk info pesanan dan pengiriman.">
          <input id={id("phone")} type="tel" inputMode="tel" autoComplete="tel" required value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={field} placeholder="0812xxxxxxxx" />
        </Field>
        <Field id={id("email")} label="Email (opsional)" error={err("contact.email")} hint="Untuk bukti pesanan.">
          <input id={id("email")} type="email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={field} />
        </Field>
        <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-small text-ink">
          <input type="checkbox" checked={contact.marketingOptIn} onChange={(e) => setContact({ ...contact, marketingOptIn: e.target.checked })} className="size-5 accent-accent" />
          Kirimi saya info produk baru dan promo (boleh tidak dicentang)
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-h3 font-semibold text-ink">2. Alamat pengiriman</legend>
        <label className="flex min-h-[var(--touch-target)] items-center gap-3 text-small text-ink">
          <input type="checkbox" checked={sameAsContact} onChange={(e) => setSameAsContact(e.target.checked)} className="size-5 accent-accent" />
          Penerima sama dengan pembeli
        </label>
        {!sameAsContact ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id("rname")} label="Nama penerima" error={err("address.recipientName")}>
              <input id={id("rname")} value={address.recipientName} onChange={(e) => setAddress({ ...address, recipientName: e.target.value })} className={field} />
            </Field>
            <Field id={id("rphone")} label="Ponsel penerima" error={err("address.phone")}>
              <input id={id("rphone")} type="tel" inputMode="tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} className={field} />
            </Field>
          </div>
        ) : null}

        <Field id={id("dest")} label="Kecamatan / kelurahan" error={err("address.destinationId") ?? searchError ?? undefined} hint="Ketik minimal 3 huruf, lalu pilih dari daftar.">
          {destination ? (
            <div className="flex min-h-[var(--touch-target)] items-center justify-between gap-2 rounded-input border border-accent bg-accent-subtle px-3">
              <span className="inline-flex items-center gap-2 text-body text-ink">
                <CheckIcon className="size-4 text-success" /> {destination.label}
              </span>
              <button
                type="button"
                onClick={() => {
                  setDestination(null);
                  resetQuote();
                }}
                className="min-h-[var(--touch-target)] px-2 text-small font-semibold text-accent underline"
              >
                Ganti
              </button>
            </div>
          ) : (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
              <input
                id={id("dest")}
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls={id("dest-list")}
                aria-autocomplete="list"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={cn(field, "pl-10")}
                placeholder="mis. Panakkukang"
              />
              {results.length > 0 ? (
                <ul id={id("dest-list")} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-input border border-rule-strong bg-surface shadow-medium">
                  {results.map((d) => (
                    <li key={d.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onClick={() => {
                          setDestination(d);
                          setQuery("");
                          setErrors((e) => ({ ...e, "address.destinationId": "" }));
                          resetQuote();
                          if (d.zipCode) setAddress((a) => ({ ...a, postalCode: d.zipCode ?? "" }));
                        }}
                        className="min-h-[var(--touch-target)] w-full px-3 py-2 text-left text-small text-ink hover:bg-paper-2"
                      >
                        {d.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </Field>

        <Field id={id("street")} label="Alamat lengkap" error={err("address.street")} hint="Nama jalan, nomor rumah, RT/RW.">
          <textarea id={id("street")} rows={3} autoComplete="street-address" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} className={cn(field, "py-2")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id("landmark")} label="Patokan (opsional)" error={err("address.landmark")}>
            <input id={id("landmark")} value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} className={field} />
          </Field>
          <Field id={id("zip")} label="Kode pos (opsional)" error={err("address.postalCode")}>
            <input id={id("zip")} inputMode="numeric" autoComplete="postal-code" maxLength={5} value={address.postalCode} onChange={(e) => setAddress({ ...address, postalCode: e.target.value })} className={field} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-h3 font-semibold text-ink">3. Pengiriman</legend>
        <Field id={id("coupon")} label="Kode kupon (opsional)">
          <input
            id={id("coupon")}
            value={coupon}
            onChange={(e) => {
              setCoupon(e.target.value.toUpperCase());
              resetQuote();
            }}
            className={field}
          />
        </Field>
        <button
          type="button"
          onClick={quote}
          disabled={quoting}
          className="min-h-[var(--touch-target)] rounded-pill border border-accent px-5 text-button font-semibold text-accent hover:bg-accent-subtle disabled:opacity-60"
        >
          {quoting ? "Menghitung ongkir…" : preview ? "Hitung ulang ongkir" : "Hitung ongkir"}
        </button>

        <div aria-live="polite">
          {preview && !preview.ok ? (
            <p role="alert" className="inline-flex items-start gap-2 text-small font-semibold text-danger">
              <AlertIcon className="mt-0.5 size-4 shrink-0" /> {preview.message}
            </p>
          ) : null}
          {preview?.ok && preview.couponMessage ? (
            <p className="inline-flex items-start gap-2 text-small font-semibold text-warning">
              <AlertIcon className="mt-0.5 size-4 shrink-0" /> {preview.couponMessage}
            </p>
          ) : null}
          {preview?.ok ? (
            <div role="radiogroup" aria-label="Layanan pengiriman" className="mt-2 flex flex-col gap-2">
              {preview.options.map((o) => {
                const key = optionKey(o);
                return (
                  <label
                    key={key}
                    className={cn(
                      "flex min-h-[var(--touch-target)] cursor-pointer items-center justify-between gap-3 rounded-input border px-3 py-2",
                      selected === key ? "border-accent bg-accent-subtle" : "border-rule-strong bg-surface",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input type="radio" name="layanan" checked={selected === key} onChange={() => setSelected(key)} className="size-5 accent-accent" />
                      <span>
                        <span className="block text-body font-semibold text-ink">{o.courierName} {o.serviceCode}</span>
                        {o.etd ? <span className="block text-small text-muted">Estimasi {o.etd} hari</span> : null}
                      </span>
                    </span>
                    <span className="text-price font-bold text-ink">{formatRupiah(o.costIdr)}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </fieldset>

      <section aria-labelledby={id("ringkasan")} className="rounded-card border border-rule bg-surface p-4">
        <h2 id={id("ringkasan")} className="text-h3 font-semibold text-ink">Ringkasan</h2>
        <dl className="mt-3 flex flex-col gap-2 text-body">
          <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="text-ink">{formatRupiah(preview?.ok ? preview.itemsSubtotalIdr : subtotalIdr)}</dd></div>
          {preview?.ok && preview.discountIdr > 0 ? (
            <div className="flex justify-between"><dt className="text-muted">Diskon kupon</dt><dd className="text-success">−{formatRupiah(preview.discountIdr)}</dd></div>
          ) : null}
          <div className="flex justify-between"><dt className="text-muted">Ongkir</dt><dd className="text-ink">{chosen ? formatRupiah(chosen.costIdr) : "Belum dihitung"}</dd></div>
          <div className="flex justify-between border-t border-rule pt-2"><dt className="font-bold text-ink">Total bayar</dt><dd className="text-h3 font-bold text-ink">{chosen ? formatRupiah(chosen.grandTotalIdr) : "—"}</dd></div>
        </dl>
        <p className="mt-3 text-small text-muted">Stok ditahan 30 menit setelah pesanan dibuat. Selesaikan pembayaran sebelum batas waktu.</p>
        {message ? (
          <p role="alert" className="mt-3 inline-flex items-start gap-2 text-small font-semibold text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" /> {message}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={placing || !chosen}
          className="mt-4 min-h-[var(--touch-target)] w-full rounded-pill bg-accent px-6 text-button font-semibold text-ink-inverse shadow-low hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-muted disabled:shadow-none"
        >
          {placing ? "Membuat pesanan…" : "Buat pesanan & lanjut bayar"}
        </button>
      </section>
    </form>
  );
}

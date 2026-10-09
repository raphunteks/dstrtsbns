"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { FulfillmentMode } from "@prisma/client";
import { addToCartAction, type AddToCartState } from "@/app/(store)/actions";
import { AlertIcon, CheckIcon, ClockIcon, TruckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatRupiah } from "@/lib/money";
import { modeLabel, processingText } from "./labels";

export type PickerVariant = {
  id: string;
  attributes: Record<string, string>;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  purchasable: boolean;
  available: number;
  mode: FulfillmentMode;
  processingDays: { min: number; max: number };
  originLabel: string;
};

const MAX_QTY = 20;

/** Pilih varian + tambah ke keranjang (FR-007–FR-011). Server tetap memvalidasi ulang. */
export function VariantPicker({ variants }: { variants: PickerVariant[] }) {
  const keys = useMemo(() => {
    const set = new Set<string>();
    variants.forEach((v) => Object.keys(v.attributes).forEach((k) => set.add(k)));
    return [...set];
  }, [variants]);

  const initial = variants.length === 1 ? variants[0]!.attributes : (variants.find((v) => v.purchasable)?.attributes ?? {});
  const [selected, setSelected] = useState<Record<string, string>>(keys.length === 0 ? {} : initial);
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, pending] = useActionState<AddToCartState, FormData>(addToCartAction, null);

  const variant =
    variants.length === 1
      ? variants[0]
      : variants.find((v) => keys.every((k) => v.attributes[k] === selected[k]));
  const maxQty = variant?.purchasable ? Math.min(variant.available, MAX_QTY) : 0;
  const qty = Math.min(Math.max(1, quantity), Math.max(1, maxQty));

  function valuesFor(key: string) {
    return [...new Set(variants.map((v) => v.attributes[key]).filter((x): x is string => Boolean(x)))];
  }
  /** Nilai yang tidak punya varian tersedia bersama pilihan lain → ditandai habis, tetap bisa dipilih. */
  function valueAvailable(key: string, value: string) {
    return variants.some(
      (v) => v.purchasable && v.attributes[key] === value && keys.every((k) => k === key || !selected[k] || v.attributes[k] === selected[k]),
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div aria-live="polite">
        {variant ? (
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="text-h2 font-bold text-ink">{formatRupiah(variant.priceIdr)}</span>
            {variant.compareAtPriceIdr ? (
              <s className="text-body text-muted">
                <span className="sr-only">Harga sebelumnya </span>
                {formatRupiah(variant.compareAtPriceIdr)}
              </s>
            ) : null}
          </p>
        ) : (
          <p className="text-body text-muted">Pilih {keys.join(" dan ").toLowerCase()} untuk melihat harga.</p>
        )}
      </div>

      {keys.map((key) => (
        <fieldset key={key}>
          <legend className="text-small font-semibold text-ink">
            {key}
            {selected[key] ? <span className="font-normal text-muted">: {selected[key]}</span> : null}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {valuesFor(key).map((value) => {
              const ok = valueAvailable(key, value);
              const checked = selected[key] === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "relative inline-flex min-h-[var(--touch-target)] min-w-[var(--touch-target)] cursor-pointer items-center justify-center rounded-input border px-4 text-small font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                    checked ? "border-accent bg-accent-subtle text-ink" : "border-rule-strong bg-surface text-ink",
                    !ok && "text-muted line-through",
                  )}
                >
                  <input
                    type="radio"
                    name={`attr-${key}`}
                    value={value}
                    checked={checked}
                    onChange={() => setSelected((s) => ({ ...s, [key]: value }))}
                    className="sr-only"
                  />
                  {value}
                  {!ok ? <span className="sr-only"> (habis)</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      {variant ? (
        variant.purchasable ? (
          <ul className="flex flex-col gap-1 text-small text-ink">
            <li className="inline-flex items-center gap-2 font-semibold text-success">
              <CheckIcon className="size-4" /> {modeLabel[variant.mode]} · tersedia {variant.available}
            </li>
            <li className="inline-flex items-center gap-2">
              <ClockIcon className="size-4 text-muted" /> {processingText(variant.processingDays)}
            </li>
            <li className="inline-flex items-center gap-2">
              <TruckIcon className="size-4 text-muted" /> Dikirim dari {variant.originLabel}
            </li>
          </ul>
        ) : (
          <p className="inline-flex items-center gap-2 text-small font-semibold text-danger">
            <AlertIcon className="size-4" /> Varian ini sedang habis
          </p>
        )
      ) : null}

      <input type="hidden" name="variantId" value={variant?.id ?? ""} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-input border border-rule-strong bg-surface">
          <button
            type="button"
            onClick={() => setQuantity(qty - 1)}
            disabled={qty <= 1}
            className="size-[var(--touch-target)] text-h3 text-ink disabled:text-muted"
            aria-label="Kurangi jumlah"
          >
            −
          </button>
          <label htmlFor="qty" className="sr-only">Jumlah</label>
          <input
            id="qty"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, maxQty)}
            value={qty}
            onChange={(e) => setQuantity(Number(e.target.value) || 1)}
            className="w-12 bg-transparent text-center text-body font-semibold text-ink"
          />
          <button
            type="button"
            onClick={() => setQuantity(qty + 1)}
            disabled={qty >= maxQty}
            className="size-[var(--touch-target)] text-h3 text-ink disabled:text-muted"
            aria-label="Tambah jumlah"
          >
            +
          </button>
        </div>
        <button
          type="submit"
          disabled={!variant?.purchasable || pending}
          className="min-h-[var(--touch-target)] flex-1 rounded-pill bg-accent px-6 text-button font-semibold text-ink-inverse shadow-low hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-paper-3 disabled:text-muted disabled:shadow-none"
        >
          {pending ? "Menambahkan…" : "Tambah ke keranjang"}
        </button>
      </div>

      <div role="status" aria-live="polite" className="min-h-6">
        {state ? (
          <p className={cn("inline-flex items-center gap-2 text-small font-semibold", state.ok ? "text-success" : "text-danger")}>
            {state.ok ? <CheckIcon className="size-4" /> : <AlertIcon className="size-4" />}
            {state.message}
            {state.ok ? (
              <Link href="/keranjang" className="ml-1 text-accent underline">Lihat keranjang</Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}

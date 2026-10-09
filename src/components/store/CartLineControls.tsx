"use client";

import { useActionState } from "react";
import { updateCartLineAction, type CartActionState } from "@/app/(store)/keranjang/actions";
import { cn } from "@/lib/cn";

/** Stepper jumlah + hapus. Tiap tombol adalah submit form → tetap jalan tanpa JS. */
export function CartLineControls({ variantId, quantity, max }: { variantId: string; quantity: number; max: number }) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(updateCartLineAction, null);
  const btn = "size-[var(--touch-target)] text-h3 text-ink disabled:text-muted";
  return (
    <div className="flex flex-col items-start gap-1">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="variantId" value={variantId} />
        <div className="inline-flex items-center rounded-input border border-rule-strong bg-surface" aria-busy={pending}>
          <button type="submit" name="quantity" value={quantity - 1} disabled={pending || quantity <= 1} className={btn} aria-label="Kurangi jumlah">
            −
          </button>
          <span className="w-10 text-center text-body font-semibold text-ink" aria-label={`Jumlah ${quantity}`}>
            {quantity}
          </span>
          <button
            type="submit"
            name="quantity"
            value={quantity + 1}
            disabled={pending || quantity >= Math.min(max, 20)}
            className={btn}
            aria-label="Tambah jumlah"
          >
            +
          </button>
        </div>
        <button
          type="submit"
          name="quantity"
          value={0}
          disabled={pending}
          className="inline-flex min-h-[var(--touch-target)] items-center px-2 text-small font-semibold text-danger underline"
        >
          Hapus
        </button>
      </form>
      {state && !state.ok ? (
        <p role="alert" className={cn("text-small font-semibold text-danger")}>{state.message}</p>
      ) : null}
    </div>
  );
}

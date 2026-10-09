-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK constraint yang tidak bisa ditulis di schema.prisma.
-- Ini lapisan terakhir: walau ada bug di kode, database menolak stok negatif,
-- oversell, total yang tidak konsisten, dan nominal tidak masuk akal.
-- ─────────────────────────────────────────────────────────────────────────────

-- Inventori (BR-003, BR-024, AC-004)
ALTER TABLE "app"."ProductVariant"
  ADD CONSTRAINT "ProductVariant_stock_valid"
    CHECK ("stockOnHand" >= 0 AND "stockReserved" >= 0 AND "stockReserved" <= "stockOnHand"),
  ADD CONSTRAINT "ProductVariant_price_valid"
    CHECK ("priceIdr" >= 0 AND ("compareAtPriceIdr" IS NULL OR "compareAtPriceIdr" > "priceIdr")),
  ADD CONSTRAINT "ProductVariant_weight_valid"
    CHECK ("weightGrams" > 0);

ALTER TABLE "app"."Product"
  ADD CONSTRAINT "Product_price_range_valid"
    CHECK ("minPriceIdr" IS NULL OR "maxPriceIdr" IS NULL OR "minPriceIdr" <= "maxPriceIdr");

ALTER TABLE "app"."PreorderAllocation"
  ADD CONSTRAINT "PreorderAllocation_quota_valid"
    CHECK ("quotaTotal" >= 0 AND "quotaReserved" >= 0 AND "quotaReserved" <= "quotaTotal"),
  ADD CONSTRAINT "PreorderAllocation_window_valid"
    CHECK ("processingDaysMin" >= 0 AND "processingDaysMin" <= "processingDaysMax");

ALTER TABLE "app"."SupplierAvailability"
  ADD CONSTRAINT "SupplierAvailability_qty_valid"
    CHECK ("committedQty" >= 0 AND "reservedQty" >= 0 AND "reservedQty" <= "committedQty");

ALTER TABLE "app"."FulfillmentSource"
  ADD CONSTRAINT "FulfillmentSource_window_valid"
    CHECK ("processingDaysMin" >= 0 AND "processingDaysMin" <= "processingDaysMax");

ALTER TABLE "app"."StockReservation"
  ADD CONSTRAINT "StockReservation_qty_valid" CHECK ("quantity" > 0),
  ADD CONSTRAINT "StockReservation_supplier_link"
    CHECK (("mode" = 'supplier_fulfilled') = ("supplierAvailabilityId" IS NOT NULL));

ALTER TABLE "app"."InventoryLedger"
  ADD CONSTRAINT "InventoryLedger_delta_nonzero" CHECK ("delta" <> 0);

ALTER TABLE "app"."CartItem"
  ADD CONSTRAINT "CartItem_qty_valid" CHECK ("quantity" > 0 AND "addedPriceIdr" >= 0);

-- Pesanan (BR-001, BR-007)
ALTER TABLE "app"."Order"
  ADD CONSTRAINT "Order_money_nonneg"
    CHECK ("itemsSubtotalIdr" >= 0 AND "discountIdr" >= 0 AND "shippingIdr" >= 0
           AND "feeIdr" >= 0 AND "grandTotalIdr" >= 0),
  ADD CONSTRAINT "Order_total_consistent"
    CHECK ("grandTotalIdr" = "itemsSubtotalIdr" - "discountIdr" + "shippingIdr" + "feeIdr"),
  ADD CONSTRAINT "Order_discount_le_subtotal" CHECK ("discountIdr" <= "itemsSubtotalIdr"),
  ADD CONSTRAINT "Order_currency_idr" CHECK ("currency" = 'IDR');

ALTER TABLE "app"."OrderItem"
  ADD CONSTRAINT "OrderItem_values_valid"
    CHECK ("quantity" > 0 AND "unitPriceIdr" >= 0 AND "discountIdr" >= 0
           AND "lineTotalIdr" = "unitPriceIdr" * "quantity" - "discountIdr");

-- Pembayaran & refund (BR-014, BR-032)
ALTER TABLE "app"."PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_amount_positive" CHECK ("amountIdr" > 0);

ALTER TABLE "app"."Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountIdr" > 0);

-- Promo
ALTER TABLE "app"."Coupon"
  ADD CONSTRAINT "Coupon_value_valid"
    CHECK ("value" > 0 AND ("type" <> 'percentage' OR "value" <= 10000)),
  ADD CONSTRAINT "Coupon_period_valid" CHECK ("startsAt" < "endsAt");

-- Hanya satu baris pengaturan toko
ALTER TABLE "app"."StoreSettings"
  ADD CONSTRAINT "StoreSettings_singleton" CHECK ("id" = 1);

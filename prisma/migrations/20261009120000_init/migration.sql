-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "StaffRoleName" AS ENUM ('admin_catalog', 'admin_order', 'admin_finance', 'super_admin');

-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'published', 'unpublished', 'archived');

-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('ready_stock', 'preorder', 'supplier_fulfilled');

-- CreateEnum
CREATE TYPE "FulfillmentSourceType" AS ENUM ('own_warehouse', 'preorder_production', 'supplier');

-- CreateEnum
CREATE TYPE "InventoryReason" AS ENUM ('initial_count', 'stock_in', 'correction', 'return_restock', 'damaged', 'sale_committed', 'manual_out');

-- CreateEnum
CREATE TYPE "ReservationState" AS ENUM ('active', 'converted', 'released', 'expired');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'paid', 'processing', 'packed', 'shipped', 'delivered', 'completed', 'payment_failed', 'expired', 'cancelled', 'payment_exception', 'return_requested', 'returned', 'refund_pending', 'partially_refunded', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'pending', 'paid', 'canceled', 'expired', 'failed', 'exception');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('not_started', 'awaiting_supply', 'supplier_confirmed', 'picking', 'packed', 'ready_to_ship', 'shipment_requested', 'shipped', 'delivered', 'shipment_exception', 'fulfillment_exception');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('requested', 'approved', 'rejected', 'in_transit', 'received', 'inspected', 'closed');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('not_requested', 'pending', 'processing', 'succeeded', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('unsettled', 'settled', 'disputed', 'reconciled');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('pakasir');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('pending', 'completed', 'canceled', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "PaymentEventValidation" AS ENUM ('valid', 'invalid_secret', 'mismatch', 'duplicate');

-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('komerce_delivery', 'manual_courier');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('draft', 'requested', 'picked_up', 'in_transit', 'delivered', 'exception', 'cancelled');

-- CreateEnum
CREATE TYPE "RateValidation" AS ENUM ('valid', 'stale', 'rejected');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('percentage', 'fixed_amount');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('manual_transfer', 'provider_dashboard');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('question', 'complaint', 'cancel_request', 'return_request', 'other');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('faq', 'policy', 'banner', 'static');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'whatsapp', 'sms');

-- CreateEnum
CREATE TYPE "NotificationOutcome" AS ENUM ('queued', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "ProviderService" AS ENUM ('pakasir', 'rajaongkir_cost', 'komerce_delivery');

-- CreateEnum
CREATE TYPE "ProviderEnvironment" AS ENUM ('sandbox', 'live');

-- CreateEnum
CREATE TYPE "FulfillmentCaseStatus" AS ENUM ('requested', 'confirmed', 'exception', 'resolved');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffRole" (
    "userId" UUID NOT NULL,
    "role" "StaffRoleName" NOT NULL,
    "grantedById" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("userId","role")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "userId" UUID NOT NULL,
    "displayName" TEXT,
    "marketingOptInAt" TIMESTAMP(3),
    "preferences" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "provinceName" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "districtName" TEXT NOT NULL,
    "subdistrictName" TEXT,
    "postalCode" TEXT,
    "street" TEXT NOT NULL,
    "landmark" TEXT,
    "rajaongkirDestinationId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" UUID,
    "status" "CategoryStatus" NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attributeSchema" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "material" TEXT,
    "careInstructions" TEXT,
    "sizeChart" JSONB,
    "categoryId" UUID NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "minPriceIdr" INTEGER,
    "maxPriceIdr" INTEGER,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "attributeKey" TEXT NOT NULL,
    "priceIdr" INTEGER NOT NULL,
    "compareAtPriceIdr" INTEGER,
    "weightGrams" INTEGER NOT NULL,
    "lengthCm" INTEGER,
    "widthCm" INTEGER,
    "heightCm" INTEGER,
    "status" "VariantStatus" NOT NULL DEFAULT 'active',
    "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'ready_stock',
    "fulfillmentSourceId" UUID NOT NULL,
    "stockOnHand" INTEGER NOT NULL DEFAULT 0,
    "stockReserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "objectKey" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLedger" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "InventoryReason" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "actorUserId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "mode" "FulfillmentMode" NOT NULL,
    "state" "ReservationState" NOT NULL DEFAULT 'active',
    "supplierAvailabilityId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreorderAllocation" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quotaTotal" INTEGER NOT NULL,
    "quotaReserved" INTEGER NOT NULL DEFAULT 0,
    "processingDaysMin" INTEGER NOT NULL,
    "processingDaysMax" INTEGER NOT NULL,
    "cutoffAt" TIMESTAMP(3),
    "policyNote" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreorderAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" JSONB NOT NULL DEFAULT '{}',
    "slaDays" INTEGER,
    "verifiedCapacityNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentSource" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FulfillmentSourceType" NOT NULL,
    "originLabel" TEXT NOT NULL,
    "originAddress" JSONB NOT NULL,
    "rajaongkirOriginId" TEXT,
    "komerceOriginId" TEXT,
    "processingDaysMin" INTEGER NOT NULL DEFAULT 0,
    "processingDaysMax" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "supplierId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAvailability" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "committedQty" INTEGER NOT NULL,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "sourceReference" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "userId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "addedPriceIdr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "publicNumber" TEXT NOT NULL,
    "userId" UUID,
    "contact" JSONB NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'not_started',
    "refundStatus" "RefundStatus" NOT NULL DEFAULT 'not_requested',
    "settlementStatus" "SettlementStatus" NOT NULL DEFAULT 'unsettled',
    "fulfillmentMode" "FulfillmentMode" NOT NULL,
    "fulfillmentSourceId" UUID NOT NULL,
    "processingDaysMin" INTEGER NOT NULL,
    "processingDaysMax" INTEGER NOT NULL,
    "itemsSubtotalIdr" INTEGER NOT NULL,
    "discountIdr" INTEGER NOT NULL DEFAULT 0,
    "shippingIdr" INTEGER NOT NULL,
    "feeIdr" INTEGER NOT NULL DEFAULT 0,
    "grandTotalIdr" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "couponCode" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "guestAccessTokenHash" TEXT,
    "reservationExpiresAt" TIMESTAMP(3) NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID,
    "productNameSnap" TEXT NOT NULL,
    "skuSnap" TEXT NOT NULL,
    "attributesSnap" JSONB NOT NULL,
    "unitPriceIdr" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountIdr" INTEGER NOT NULL DEFAULT 0,
    "lineTotalIdr" INTEGER NOT NULL,
    "weightGramsSnap" INTEGER NOT NULL,
    "fulfillmentModeSnap" "FulfillmentMode" NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RajaOngkirRateSnapshot" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "courierCode" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "costIdr" INTEGER NOT NULL,
    "etd" TEXT,
    "quotedAt" TIMESTAMP(3) NOT NULL,
    "validationState" "RateValidation" NOT NULL DEFAULT 'valid',

    CONSTRAINT "RajaOngkirRateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'pakasir',
    "projectSlug" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "txnId" TEXT,
    "method" TEXT NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "feeIdr" INTEGER,
    "totalPaymentIdr" INTEGER,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'pending',
    "isSandbox" BOOLEAN NOT NULL,
    "paymentUrl" TEXT,
    "qrString" TEXT,
    "vaNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedStatusAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentAttemptId" UUID,
    "fingerprint" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "validation" "PaymentEventValidation" NOT NULL,
    "payloadRedacted" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementRecord" (
    "id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'pakasir',
    "providerReference" TEXT NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "feeIdr" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'settled',
    "matchedAttemptIds" TEXT[],
    "settledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "mode" "ShipmentMode" NOT NULL,
    "courierCode" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "costIdr" INTEGER NOT NULL,
    "waybill" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'draft',
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "trackingLastSyncAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "komerceOrderRef" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "financialStatus" TEXT,
    "pickupStatus" TEXT,
    "labelRef" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentCase" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID,
    "mode" "FulfillmentMode" NOT NULL,
    "sourceId" UUID,
    "status" "FulfillmentCaseStatus" NOT NULL DEFAULT 'requested',
    "ownerId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minSubtotalIdr" INTEGER,
    "maxDiscountIdr" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "eligibility" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID,
    "discountIdr" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'requested',
    "reason" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "evidenceKeys" TEXT[],
    "decisionNote" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentAttemptId" UUID NOT NULL,
    "amountIdr" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "method" "RefundMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "providerReference" TEXT,
    "evidenceKey" TEXT,
    "succeededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "orderId" UUID,
    "channel" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "assigneeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageContent" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "orderId" UUID,
    "userId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "outcome" "NotificationOutcome" NOT NULL DEFAULT 'queued',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "storeName" TEXT NOT NULL DEFAULT 'Daster Tasbon Olshop',
    "supportEmail" TEXT,
    "supportWhatsapp" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Makassar',
    "reservationHoldMinutes" INTEGER NOT NULL DEFAULT 30,
    "featureFlags" JSONB NOT NULL DEFAULT '{"ready_stock":true,"preorder":false,"supplier_fulfilled":false,"komerce_delivery":false}',
    "businessInfo" JSONB NOT NULL DEFAULT '{}',
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredentialReference" (
    "id" UUID NOT NULL,
    "service" "ProviderService" NOT NULL,
    "environment" "ProviderEnvironment" NOT NULL,
    "secretReference" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCredentialReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWebhookInbox" (
    "id" UUID NOT NULL,
    "provider" "ProviderService" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "externalEventId" TEXT,
    "verified" BOOLEAN NOT NULL,
    "payloadRedacted" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderWebhookInbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_status_categoryId_idx" ON "Product"("status", "categoryId");

-- CreateIndex
CREATE INDEX "Product_status_minPriceIdr_idx" ON "Product"("status", "minPriceIdr");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_status_idx" ON "ProductVariant"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_attributeKey_key" ON "ProductVariant"("productId", "attributeKey");

-- CreateIndex
CREATE INDEX "MediaAsset_productId_sortOrder_idx" ON "MediaAsset"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "InventoryLedger_variantId_createdAt_idx" ON "InventoryLedger"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockReservation_state_expiresAt_idx" ON "StockReservation"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockReservation_orderId_variantId_key" ON "StockReservation"("orderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PreorderAllocation_variantId_key" ON "PreorderAllocation"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentSource_code_key" ON "FulfillmentSource"("code");

-- CreateIndex
CREATE INDEX "SupplierAvailability_variantId_validUntil_idx" ON "SupplierAvailability"("variantId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_token_key" ON "Cart"("token");

-- CreateIndex
CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicNumber_key" ON "Order"("publicNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_guestAccessTokenHash_key" ON "Order"("guestAccessTokenHash");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "RajaOngkirRateSnapshot_orderId_key" ON "RajaOngkirRateSnapshot"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerOrderId_key" ON "PaymentAttempt"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_txnId_key" ON "PaymentAttempt"("txnId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_fingerprint_key" ON "PaymentEvent"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementRecord_providerReference_key" ON "SettlementRecord"("providerReference");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_courierCode_waybill_key" ON "Shipment"("courierCode", "waybill");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_shipmentId_key" ON "DeliveryOrder"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_komerceOrderRef_key" ON "DeliveryOrder"("komerceOrderRef");

-- CreateIndex
CREATE INDEX "FulfillmentCase_status_idx" ON "FulfillmentCase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PageContent_slug_key" ON "PageContent"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_idempotencyKey_key" ON "NotificationLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationLog_outcome_createdAt_idx" ON "NotificationLog"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredentialReference_service_environment_key" ON "ProviderCredentialReference"("service", "environment");

-- CreateIndex
CREATE INDEX "ProviderWebhookInbox_processedAt_receivedAt_idx" ON "ProviderWebhookInbox"("processedAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookInbox_provider_fingerprint_key" ON "ProviderWebhookInbox"("provider", "fingerprint");

-- AddForeignKey
ALTER TABLE "StaffRole" ADD CONSTRAINT "StaffRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_fulfillmentSourceId_fkey" FOREIGN KEY ("fulfillmentSourceId") REFERENCES "FulfillmentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_supplierAvailabilityId_fkey" FOREIGN KEY ("supplierAvailabilityId") REFERENCES "SupplierAvailability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreorderAllocation" ADD CONSTRAINT "PreorderAllocation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentSource" ADD CONSTRAINT "FulfillmentSource_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAvailability" ADD CONSTRAINT "SupplierAvailability_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAvailability" ADD CONSTRAINT "SupplierAvailability_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfillmentSourceId_fkey" FOREIGN KEY ("fulfillmentSourceId") REFERENCES "FulfillmentSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RajaOngkirRateSnapshot" ADD CONSTRAINT "RajaOngkirRateSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentCase" ADD CONSTRAINT "FulfillmentCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentCase" ADD CONSTRAINT "FulfillmentCase_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentCase" ADD CONSTRAINT "FulfillmentCase_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FulfillmentSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


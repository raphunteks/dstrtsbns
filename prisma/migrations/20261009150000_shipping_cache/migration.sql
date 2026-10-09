SET search_path TO "app";

-- AlterTable
ALTER TABLE "app"."StoreSettings" ADD COLUMN "shippingCouriers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "app"."ProviderCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ProviderCache_expiresAt_idx" ON "app"."ProviderCache"("expiresAt");

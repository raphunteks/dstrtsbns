SET search_path TO "app";

-- AlterTable
ALTER TABLE "app"."StoreSettings" ADD COLUMN "paymentMethods" TEXT[] DEFAULT ARRAY['payment_link']::TEXT[];

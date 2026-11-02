-- Add a second listing photo and seller-defined condition text without changing existing rows.
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'OLD';
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'CUSTOM';

ALTER TABLE "Listing"
ADD COLUMN "photoUrl2" TEXT,
ADD COLUMN "customCondition" VARCHAR(80);

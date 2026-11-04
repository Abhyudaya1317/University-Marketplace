-- Add food-specific condition values while retaining existing listing values.
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'FRESH';
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'PACKAGED';
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'OPENED';
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'PREPARED';
ALTER TYPE "ProductCondition" ADD VALUE IF NOT EXISTS 'FROZEN';

-- Add archive state without changing which existing offers are active.
ALTER TYPE "ListingStatus" ADD VALUE 'ARCHIVED';

-- Add per-seller titles while keeping existing display names intact.
ALTER TABLE "Listing" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';
UPDATE "Listing" AS listing
SET "title" = product."name"
FROM "Product" AS product
WHERE product."id" = listing."productId";
ALTER TABLE "Listing" ALTER COLUMN "title" DROP DEFAULT;

-- Preserve current listings as good condition until sellers choose to edit them.
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR');
ALTER TABLE "Listing" ADD COLUMN "condition" "ProductCondition" NOT NULL DEFAULT 'GOOD';
ALTER TABLE "Listing" ADD COLUMN "archivedAt" TIMESTAMP(3);

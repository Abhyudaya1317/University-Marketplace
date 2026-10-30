-- Re-key each saved shared product to its cheapest available individual offer.
-- If an old saved product has no listing at all, SET NOT NULL below intentionally stops
-- the migration instead of silently deleting that user's saved entry.
ALTER TABLE "ProductFavorite" ADD COLUMN "listingId" INTEGER;

UPDATE "ProductFavorite" AS favorite
SET "listingId" = (
    SELECT listing."id"
    FROM "Listing" AS listing
    WHERE listing."productId" = favorite."productId"
    ORDER BY (listing."status" = 'ACTIVE') DESC, listing."price" ASC, listing."id" ASC
    LIMIT 1
);

ALTER TABLE "ProductFavorite" ALTER COLUMN "listingId" SET NOT NULL;
DROP INDEX "ProductFavorite_userId_productId_key";
DROP INDEX "ProductFavorite_productId_createdAt_idx";
ALTER TABLE "ProductFavorite" DROP CONSTRAINT "ProductFavorite_productId_fkey";
ALTER TABLE "ProductFavorite" DROP COLUMN "productId";
ALTER TABLE "ProductFavorite" RENAME TO "ListingFavorite";
ALTER TABLE "ListingFavorite" RENAME CONSTRAINT "ProductFavorite_pkey" TO "ListingFavorite_pkey";
ALTER TABLE "ListingFavorite" RENAME CONSTRAINT "ProductFavorite_userId_fkey" TO "ListingFavorite_userId_fkey";

ALTER TABLE "ListingFavorite"
ADD CONSTRAINT "ListingFavorite_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "ListingFavorite_userId_listingId_key" ON "ListingFavorite"("userId", "listingId");
CREATE INDEX "ListingFavorite_listingId_createdAt_idx" ON "ListingFavorite"("listingId", "createdAt");

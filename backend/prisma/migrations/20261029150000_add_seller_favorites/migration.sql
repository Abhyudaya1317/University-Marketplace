-- Store saved sellers separately from public seller listings.
CREATE TABLE "SellerFavorite" (
    "id" SERIAL NOT NULL,
    "fanId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerFavorite_pkey" PRIMARY KEY ("id")
);

-- Prevent duplicate saved sellers and support reverse lookups for seller activity.
CREATE UNIQUE INDEX "SellerFavorite_fanId_sellerId_key" ON "SellerFavorite"("fanId", "sellerId");
CREATE INDEX "SellerFavorite_sellerId_createdAt_idx" ON "SellerFavorite"("sellerId", "createdAt");

-- Remove a saved relationship when either account is removed.
ALTER TABLE "SellerFavorite" ADD CONSTRAINT "SellerFavorite_fanId_fkey"
    FOREIGN KEY ("fanId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SellerFavorite" ADD CONSTRAINT "SellerFavorite_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

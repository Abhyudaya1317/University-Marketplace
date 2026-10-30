-- Store saved product references separately for each signed-in account.
CREATE TABLE "ProductFavorite" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFavorite_pkey" PRIMARY KEY ("id")
);

-- One account can save a product once; product lookups can list recent saves efficiently.
CREATE UNIQUE INDEX "ProductFavorite_userId_productId_key" ON "ProductFavorite"("userId", "productId");
CREATE INDEX "ProductFavorite_productId_createdAt_idx" ON "ProductFavorite"("productId", "createdAt");

-- Remove saved references automatically when an account or product is deleted.
ALTER TABLE "ProductFavorite"
ADD CONSTRAINT "ProductFavorite_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductFavorite"
ADD CONSTRAINT "ProductFavorite_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

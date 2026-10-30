-- Record the selected payment method and each participant's order confirmations.
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'SELLER_CONFIRMED', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- Keep each order's agreed price and buyer contact with its listing and participants.
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "buyerPhone" VARCHAR(30) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "buyerMessage" VARCHAR(500),
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH_ON_DELIVERY',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "meetingAt" TIMESTAMP(3),
    "meetingLocation" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- Support a user's order history and listing state checks.
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt");
CREATE INDEX "Order_sellerId_createdAt_idx" ON "Order"("sellerId", "createdAt");
CREATE INDEX "Order_listingId_status_idx" ON "Order"("listingId", "status");

-- Preserve order records if a listing is referenced; remove orders with their accounts.
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
